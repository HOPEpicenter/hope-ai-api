"use strict";

const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { TableClient } = require("@azure/data-tables");

const SITE = "hope-kiosk-acceptance-api";

const STAFF_ID = "staff-" + createHash("sha256")
    .update(SITE + ":first-administrator:v1")
    .digest("hex").slice(0, 32);

const HEAD = "__staff_security__head";
const RECEIPT = "__staff_security__receipt__first_admin_v1";

const GUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function build(input) {
    assert.equal(input.site, SITE);

    for (const value of [
        input.tenantId,
        input.objectId,
        input.operatorId,
        input.operationId
    ]) {
        assert.equal(typeof value, "string");
        assert.match(value, GUID);
    }

    assert.equal(
        new Date(input.occurredAt).toISOString(),
        input.occurredAt
    );

    assert.equal(typeof input.name, "string");
    assert.ok(input.name.length > 0 && input.name.length <= 120);
    assert.equal(input.name, input.name.trim());

    assert.match(input.email, /^[^@\s]+@[^@\s]+$/);
    assert.equal(input.email, input.email.toLowerCase());

    const data = {
        displayName: input.name,
        roleLabel: "Pastor",
        status: "active",
        entraTenantId: input.tenantId,
        entraObjectId: input.objectId,
        email: input.email
    };

    return [
        {
            partitionKey: STAFF_ID,
            rowKey: HEAD,
            revision: 0,
            authorizationRevision: 0,
            state: "active"
        },
        {
            partitionKey: STAFF_ID,
            rowKey: input.occurredAt + "__" + input.operationId,
            eventId: input.operationId,
            staffId: STAFF_ID,
            type: "staff.created",
            occurredAt: input.occurredAt,
            actorId: "operator-" + input.operatorId,
            dataJson: JSON.stringify(data)
        },
        {
            partitionKey: STAFF_ID,
            rowKey: RECEIPT,
            eventId: input.operationId,
            operationId: input.operationId,
            staffId: STAFF_ID,
            operatorId: input.operatorId,
            kind: "staff.first_admin.bootstrap",
            revision: 0
        }
    ];
}

async function inspect(table, expected) {
    const rows = [];

    for await (const row of table.listEntities()) {
        rows.push(row);
        if (rows.length > expected.length) break;
    }

    if (rows.length === 0) return "empty";

    if (rows.length !== expected.length) {
        return "conflict";
    }

    const matches = expected.every(wanted => {
        const found = rows.find(row =>
            row.partitionKey === wanted.partitionKey &&
            row.rowKey === wanted.rowKey
        );

        return found && Object.entries(wanted)
            .every(([key, value]) => found[key] === value);
    });

    return matches ? "committed" : "conflict";
}

async function applyCandidate(table, input) {
    // Local candidate only. Never an Azure Function
    // authorization path or a live bootstrap command.
    if (
        process.env.HOPE_BOOTSTRAP_LOCAL_TEST !== "true" ||
        process.env.WEBSITE_SITE_NAME
    ) {
        return "denied";
    }

    const expected = build(input);
    const before = await inspect(table, expected);

    if (before === "committed") {
        return "already_committed";
    }

    if (before !== "empty") {
        return "denied";
    }

    try {
        await table.submitTransaction(
            expected.map(row => ["create", row])
        );
    } catch (error) {
        // Do not retry an uncertain commit.
        if ([409, 412].includes(error?.statusCode)) {
            return "denied";
        }

        return "uncertain";
    }

    return (await inspect(table, expected)) === "committed"
        ? "committed"
        : "uncertain";
}

async function main() {
    assert.equal(
        process.env.HOPE_BOOTSTRAP_LOCAL_TEST,
        "true"
    );

    assert.ok(!process.env.WEBSITE_SITE_NAME);

    const port = process.env.HOPE_BOOTSTRAP_TEST_PORT;
    assert.match(port, /^\d{1,5}$/);

    const account = "hopebootstrap70";
    const endpoint = `http://127.0.0.1:${port}/${account}`;

    const connection = process.env.HOPE_BOOTSTRAP_TEST_CONNECTION;
    const parts = Object.fromEntries(
        connection.split(";").filter(Boolean).map(part => {
            const i = part.indexOf("=");
            return [part.slice(0, i), part.slice(i + 1)];
        })
    );

    assert.equal(parts.AccountName, account);
    assert.equal(parts.TableEndpoint, endpoint);
    assert.equal(parts.DefaultEndpointsProtocol, "http");

    const {
        StaffEventsRepository
    } = require("../src/repositories/staffEventsRepository");

    const {
        projectStaffDirectory
    } = require("../src/domain/staff/projectStaffDirectory");

    function client(name) {
        return TableClient.fromConnectionString(
            connection,
            name,
            { allowInsecureConnection: true }
        );
    }

    const table = client("StaffEvents");
    await table.createTable();

    const first = {
        site: SITE,
        tenantId: randomUUID(),
        objectId: randomUUID(),
        operatorId: randomUUID(),
        operationId: randomUUID(),
        occurredAt: new Date().toISOString(),
        name: "Synthetic Pastor",
        email: "synthetic-pastor@example.com"
    };

    const competing = {
        ...first,
        objectId: randomUUID(),
        operationId: randomUUID()
    };

    // Wrong environment must fail closed.
    assert.throws(() => build({
        ...first,
        site: "hope-ai-api-production"
    }));

    console.log("WRONG_ENVIRONMENT_DENIED=True");

    // Two simultaneous candidates use the same fixed
    // partition and create-only security head.
    const results = await Promise.all([
        applyCandidate(table, first),
        applyCandidate(table, competing)
    ]);

    assert.equal(
        results.filter(result => result === "committed").length,
        1
    );

    const winner = results[0] === "committed"
        ? first : competing;

    const loser = winner === first ? competing : first;

    assert.equal(await inspect(table, build(winner)), "committed");
    assert.equal(await inspect(table, build(loser)), "conflict");

    console.log("CONCURRENT_BOOTSTRAP_SINGLE_WINNER=True");
    console.log("ATOMIC_EVENT_HEAD_RECEIPT_VERIFIED=True");

    // Verify the existing canonical repository can read
    // the transaction without treating metadata as Staff.
    const repository = new StaffEventsRepository(table);
    const directory = projectStaffDirectory(await repository.listAll());

    assert.equal(directory.length, 1);
    assert.equal(directory[0].staffId, STAFF_ID);
    assert.equal(directory[0].status, "active");
    assert.equal(directory[0].entraTenantId, winner.tenantId);
    assert.equal(directory[0].entraObjectId, winner.objectId);
    assert.equal(directory[0].roleLabel, "Pastor");

    console.log("CANONICAL_STAFF_PROJECTION_VERIFIED=True");
    console.log("SINGLE_ACTIVE_ADMINISTRATOR_RECORD=True");
    console.log("EXACT_ENTRA_BINDING_VERIFIED=True");

    assert.equal(
        await applyCandidate(table, winner),
        "already_committed"
    );

    assert.equal(
        await applyCandidate(table, loser),
        "denied"
    );

    console.log("EXACT_OPERATION_REPLAY_SAFE=True");
    console.log("CONFLICTING_IDENTITY_DENIED=True");

    // Simulate a successful storage transaction followed
    // by a lost acknowledgement.
    const recoveryTable = client("StaffBootstrapRecovery");
    await recoveryTable.createTable();

    let writes = 0;

    const uncertainPort = {
        listEntities: () => recoveryTable.listEntities(),
        submitTransaction: async actions => {
            writes++;
            await recoveryTable.submitTransaction(actions);
            throw new Error("simulated lost acknowledgement");
        }
    };

    assert.equal(
        await applyCandidate(uncertainPort, first),
        "uncertain"
    );

    assert.equal(writes, 1);

    assert.equal(
        await inspect(recoveryTable, build(first)),
        "committed"
    );

    assert.equal(writes, 1);

    console.log("LOST_ACKNOWLEDGEMENT_RECOVERED_READ_ONLY=True");
    console.log("NO_AUTOMATIC_WRITE_RETRY=True");

    console.log("LOCAL_BOOTSTRAP_ACCEPTANCE_PASSED=True");
}

main().catch(error => {
    console.error(
        "BOOTSTRAP_TEST_FAILED=" + (error.code || error.name)
    );
    process.exitCode = 1;
});

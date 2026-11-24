/**
 * General church-attendance family registration contract.
 *
 * This is NOT childcare check-in, custody verification,
 * child supervision, or pickup authorization.
 *
 * No children's contact details, birthdates, addresses,
 * medical information, or custody information are collected.
 */

export type VisitorChildAgeGroup =
  | "0-2"
  | "3-5"
  | "6-11"
  | "12-17";

export type VisitorFamilyChild = {
  firstName: string;
  ageGroup: VisitorChildAgeGroup;
};

export type ValidatedVisitorFamily = {
  guardianName: string;
  guardianDeclaration: true;
  children: VisitorFamilyChild[];
  attendancePurpose: "general_church_attendance";
};

export type VisitorFamilyValidation =
  | {
      valid: true;
      family: ValidatedVisitorFamily;
    }
  | {
      valid: false;
      error: string;
    };

const AGE_GROUPS: ReadonlySet<string> = new Set([
  "0-2",
  "3-5",
  "6-11",
  "12-17"
]);

const MAX_CHILDREN = 12;

function plainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function validName(value: unknown, max: number): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

export function validateVisitorFamily(
  input: unknown
): VisitorFamilyValidation {
  if (!plainObject(input)) {
    return { valid: false, error: "invalid_family" };
  }

  const allowed = new Set([
    "guardianName",
    "guardianDeclaration",
    "children"
  ]);

  if (Object.keys(input).some(key => !allowed.has(key))) {
    return { valid: false, error: "unexpected_family_fields" };
  }

  if (!validName(input.guardianName, 120)) {
    return { valid: false, error: "invalid_guardian_name" };
  }

  if (input.guardianDeclaration !== true) {
    return { valid: false, error: "guardian_declaration_required" };
  }

  if (!Array.isArray(input.children) ||
      input.children.length < 1 ||
      input.children.length > MAX_CHILDREN) {
    return { valid: false, error: "invalid_child_count" };
  }

  const children: VisitorFamilyChild[] = [];

  for (const child of input.children) {
    if (!plainObject(child)) {
      return { valid: false, error: "invalid_child" };
    }

    if (Object.keys(child).some(
      key => key !== "firstName" && key !== "ageGroup"
    )) {
      return { valid: false, error: "unexpected_child_fields" };
    }

    if (!validName(child.firstName, 60)) {
      return { valid: false, error: "invalid_child_first_name" };
    }

    if (typeof child.ageGroup !== "string" ||
        !AGE_GROUPS.has(child.ageGroup)) {
      return { valid: false, error: "invalid_child_age_group" };
    }

    children.push({
      firstName: child.firstName.trim(),
      ageGroup: child.ageGroup as VisitorChildAgeGroup
    });
  }

  return {
    valid: true,
    family: {
      guardianName: input.guardianName.trim(),
      guardianDeclaration: true,
      children,
      attendancePurpose: "general_church_attendance"
    }
  };
}
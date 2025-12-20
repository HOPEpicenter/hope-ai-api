# hope-ai-api

Azure Functions backend for HOPE.

---

## Production API

**Base URL**
https://hope-ai-api-dehmhzbxcybuaqhz.eastus-01.azurewebsites.net

---

## Endpoints

### Create Visitor
**POST** `/api/visitors`

**Full URL**
https://hope-ai-api-dehmhzbxcybuaqhz.eastus-01.azurewebsites.net/api/visitors

**Request Body**
{
  "name": "string",
  "email": "string"
}

**Response**
{
  "visitorId": "uuid"
}

---

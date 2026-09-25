/** Staff guidance only. Viewing or copying a script never records contact or sends a message. */
export type SixWeekScriptTemplate = {
  weekNumber: number;
  channel: "call" | "voicemail" | "email" | "staff_review";
  label: string;
  subject?: string;
  body: string;
};

export const SIX_WEEK_SCRIPT_CATALOG_VERSION = 1 as const;

export const SIX_WEEK_SCRIPT_TEMPLATES: readonly SixWeekScriptTemplate[] = [
  { weekNumber: 1, channel: "call", label: "Welcome call", body: "Hi [Name], this is [Your Name] from [Church Name]. Thank you for joining us on [Day]. I wanted to personally welcome you. How was your visit? Is there anything you’d like to ask us?" },
  { weekNumber: 1, channel: "voicemail", label: "Welcome voicemail", body: "Hi [Name], this is [Your Name] from [Church Name]. I’m calling to thank you for joining us. You’re welcome to call me back at [Approved Callback Number] if you have any questions. Have a wonderful week!" },
  { weekNumber: 1, channel: "email", label: "Welcome email", subject: "Thank you for joining us, [Name]", body: "Hi [Name],\n\nThank you for joining us at [Church Name] on [Day]. We’re glad you came. If you have a question or would like to know more about the church, you’re welcome to reply to this email.\n\nWarmly,\n[Your Name]" },
  { weekNumber: 2, channel: "call", label: "Invitation call", body: "Hi [Name], this is [Your Name] from [Church Name]. We’d be glad to welcome you back this Sunday at [Confirmed Service Time]. If you’d like directions or have a question before coming, just let me know." },
  { weekNumber: 2, channel: "email", label: "Invitation email", subject: "You’re welcome to join us this Sunday", body: "Hi [Name],\n\nYou’re warmly invited to join us again this Sunday at [Confirmed Service Time]. If you’d like directions or have any questions, reply here and we’ll be happy to help.\n\nHope to see you,\n[Your Name]" },
  { weekNumber: 3, channel: "call", label: "Support and prayer call", body: "Hi [Name], this is [Your Name] from [Church Name]. I wanted to check in. Do you have any questions about the church, or is there a way we can support you? If you would welcome prayer, I’d be glad to pray with you." },
  { weekNumber: 3, channel: "email", label: "Support and prayer email", subject: "Checking in from [Church Name]", body: "Hi [Name],\n\nI wanted to check in and see whether you have any questions about [Church Name] or would like support in any way. If you would welcome prayer, you’re invited to let me know as much or as little as you’re comfortable sharing.\n\nWarmly,\n[Your Name]" },
  { weekNumber: 4, channel: "call", label: "Connection call", body: "Hi [Name], this is [Your Name] from [Church Name]. I wanted to ask whether you’d be interested in meeting a pastor or learning about a group or ministry that fits your interests. If so, I can share some current options. Would you like an introduction?" },
  { weekNumber: 4, channel: "email", label: "Connection email", subject: "Finding a connection at [Church Name]", body: "Hi [Name],\n\nIf you’d like to get to know people at [Church Name], we can tell you about current groups, ministries, or opportunities to meet a pastor. Reply and let me know what interests you, and I’ll help you find a starting point.\n\nWarmly,\n[Your Name]" },
  { weekNumber: 5, channel: "call", label: "Next step call", body: "Hi [Name], this is [Your Name] from [Church Name]. I wanted to see how things are going and whether you’d like to hear about a possible next step, such as [Confirmed Group, Class, or Conversation]. There’s no pressure—what would be helpful for you right now?" },
  { weekNumber: 5, channel: "email", label: "Next step email", subject: "Exploring a next step at [Church Name]", body: "Hi [Name],\n\nIf you’re interested in learning more about [Church Name] or finding a next step, I’d be glad to help. [Confirmed Opportunity] is available on [Confirmed Date and Time], or we can simply answer your questions. Reply if you’d like more information.\n\nWarmly,\n[Your Name]" },
  { weekNumber: 6, channel: "staff_review", label: "Staff relationship review", body: "Review the six-week contact history and any response from the guest. What contact actually occurred? Did the guest express interest in returning, receiving care, meeting someone, or taking a next step? Is an owner or another action needed? Record the verified result using the existing follow-up options. If evidence is incomplete, do not assume a relationship status." },
  { weekNumber: 6, channel: "email", label: "Optional final email", subject: "Checking in from [Church Name]", body: "Hi [Name],\n\nI wanted to check in once more and thank you for connecting with [Church Name]. Whether you’d like to visit again, ask a question, or simply stay in touch, you’re welcome to reply. We’d be glad to hear from you.\n\nWarmly,\n[Your Name]" }
] as const;

export function getSixWeekScriptGuidance() {
  return {
    schemaVersion: SIX_WEEK_SCRIPT_CATALOG_VERSION,
    templates: SIX_WEEK_SCRIPT_TEMPLATES
  };
}

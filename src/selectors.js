globalThis.SKKU_RESERVATION_SELECTORS = {
  loginHints: ["input[type='password']", "form[action*='login']", "#loginForm"],
  fields: {
    eventType: ["select[name*='event']", "select[id*='event']", "#eventType"],
    organizer: ["input[name*='organ']", "input[id*='organ']", "#organizer"],
    eventName: ["input[name*='title']", "input[id*='title']", "#eventName"],
    people: ["input[name*='people']", "input[id*='people']", "#people"],
    campus: ["select[name*='campus']", "select[id*='campus']", "#campus"],
    building: ["select[name*='building']", "select[id*='building']", "#building"],
    date: ["input[type='date']", "input[name*='date']", "input[id*='date']", "#date"],
    startTime: ["select[name*='start']", "input[name*='start']", "#startTime"],
    endTime: ["select[name*='end']", "input[name*='end']", "#endTime"],
    room: ["select[name*='room']", "input[name*='room']", "#room"],
    purpose: ["textarea[name*='purpose']", "textarea[id*='purpose']", "#purpose"]
  },
  submitButtons: ["button[type='submit']", "input[type='submit']", "button[id*='save']", "button[id*='apply']"]
};

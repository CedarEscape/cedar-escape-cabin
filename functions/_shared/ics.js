function toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function foldLine(line) {
  // RFC 5545 requires folding lines longer than 75 octets.
  if (line.length <= 75) return line;
  let out = '';
  let rest = line;
  while (rest.length > 75) {
    out += rest.slice(0, 75) + '\r\n ';
    rest = rest.slice(75);
  }
  return out + rest;
}

export function buildIcs({ uid, startDate, minutes, summary, description, location }) {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + minutes * 60000);
  const now = new Date();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cedar Escape//Massage Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@cedarescapecabin.com`,
    'SEQUENCE:0',
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

// A cancellation update for a previously-sent invite, keyed to the same UID
// so the recipient's calendar app removes/updates the existing event instead
// of creating a duplicate.
export function buildIcsCancel({ uid, startDate, minutes, summary, location }) {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + minutes * 60000);
  const now = new Date();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cedar Escape//Massage Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:CANCEL',
    'BEGIN:VEVENT',
    `UID:${uid}@cedarescapecabin.com`,
    'SEQUENCE:1',
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

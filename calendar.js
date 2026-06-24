const API_KEY = "c989d08553466bf553c45f75331328ed";
const BASE    = "https://v3.football.api-sports.io";
const LEAGUE  = 1;
const SEASON  = 2026;

async function fetchJSON(path) {
  const res = await fetch(BASE + path, {
    headers: { "x-apisports-key": process.env.FOOTBALL_API_KEY || API_KEY }
  });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

function pad(n) { return String(n).padStart(2, "0"); }

function toICSDate(dateStr) {
  const d = new Date(dateStr);
  return d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) + "00Z";
}

function toICSDateEnd(dateStr) {
  const d = new Date(new Date(dateStr).getTime() + 2 * 60 * 60 * 1000);
  return d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) + "00Z";
}

function escapeICS(str) {
  return (str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildEvent(f) {
  const home = f.teams.home.name;
  const away = f.teams.away.name;
  const date = f.fixture.date;
  const venue = f.fixture.venue ? (f.fixture.venue.name || "") + (f.fixture.venue.city ? ", " + f.fixture.venue.city : "") : "";
  const round = f.league.round || "";
  const status = f.fixture.status.short;
  const isDone = ["FT","AET","PEN"].includes(status);
  const gh = f.goals ? f.goals.home : null;
  const ga = f.goals ? f.goals.away : null;

  let summary = home + " vs. " + away;
  if (isDone && gh !== null && ga !== null) {
    summary += " (" + gh + "-" + ga + ")";
  }

  let description = round;
  if (venue) description += "\\n" + venue;
  if (isDone && gh !== null) description += "\\nResultat: " + gh + "-" + ga;

  const uid = "vm2026-" + f.fixture.id + "@vmveienvidere.vercel.app";

  return [
    "BEGIN:VEVENT",
    "UID:" + uid,
    "DTSTAMP:" + toICSDate(new Date().toISOString()),
    "DTSTART:" + toICSDate(date),
    "DTEND:"   + toICSDateEnd(date),
    "SUMMARY:" + escapeICS(summary),
    "DESCRIPTION:" + escapeICS(description),
    "LOCATION:" + escapeICS(venue),
    "END:VEVENT"
  ].join("\r\n");
}

export default async function handler(req, res) {
  const team = req.query.team || null;

  try {
    const data = await fetchJSON("/fixtures?league=" + LEAGUE + "&season=" + SEASON);
    let fixtures = data.response || [];

    // Filtrer på lag hvis ?team=Norway e.l.
    if (team) {
      fixtures = fixtures.filter(f =>
        f.teams.home.name === team || f.teams.away.name === team
      );
    }

    // Sorter kronologisk
    fixtures.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    const calName = team ? team + " – VM 2026" : "VM 2026";

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//VM Veien Videre//NO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + calName,
      "X-WR-TIMEZONE:Europe/Oslo",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H",
      ...fixtures.map(buildEvent),
      "END:VCALENDAR"
    ].join("\r\n");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=21600"); // 6 timer
    res.setHeader("Content-Disposition", 'attachment; filename="vm2026.ics"');
    res.status(200).send(lines);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

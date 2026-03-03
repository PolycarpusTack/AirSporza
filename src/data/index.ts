import type { Sport, Competition, Contract, FieldConfig, DashboardWidget, Event, TechPlan } from './types'

export const SPORTS: Sport[] = [
  { id: 1, name: "Football", icon: "⚽", federation: "FIFA" },
  { id: 2, name: "Tennis", icon: "🎾", federation: "ITF" },
  { id: 3, name: "Cycling", icon: "🚴", federation: "UCI" },
  { id: 4, name: "Formula 1", icon: "🏎️", federation: "FIA" },
  { id: 5, name: "Athletics", icon: "🏃", federation: "World Athletics" },
  { id: 6, name: "Swimming", icon: "🏊", federation: "FINA" },
]

export const COMPETITIONS: Competition[] = [
  { id: 1, sportId: 1, name: "Jupiler Pro League", matches: 34, season: "2025-26" },
  { id: 2, sportId: 1, name: "Champions League", matches: 13, season: "2025-26" },
  { id: 3, sportId: 2, name: "US Open", matches: 127, season: "2026" },
  { id: 4, sportId: 2, name: "Roland Garros", matches: 127, season: "2026" },
  { id: 5, sportId: 3, name: "Tour de France", matches: 21, season: "2026" },
  { id: 6, sportId: 4, name: "F1 World Championship", matches: 24, season: "2026" },
  { id: 7, sportId: 5, name: "European Championships", matches: 48, season: "2026" },
]

export const COMPLEXES = ["Lotto Arena", "Koning Boudewijnstadion", "Jan Breydel", "Bosuil", "Roland Garros", "Spa-Francorchamps", "Stade de France", "Arthur Ashe Stadium", "Col du Tourmalet", "Ghelamco Arena"]
export const CHANNELS = ["VRT 1", "VRT Canvas", "VRT MAX", "Ketnet"]
export const RADIO_CHANNELS = ["Radio 1", "MNM", "Klara", "Studio Brussel"]
export const CATEGORIES = ["Men", "Women", "Mixed", "Youth"]
export const PHASES = ["Group Stage", "Round of 16", "Quarter-final", "Semi-final", "Final", "Regular Season", "Stage"]
export const ENCODERS = ["ENC-01", "ENC-02", "ENC-03", "ENC-04", "ENC-05", "ENC-06", "ENC-07", "ENC-08"]

export const DEFAULT_EVENT_FIELDS: FieldConfig[] = [
  { id: "sport", label: "Sport", type: "dropdown", options: "sports", required: true, visible: true, order: 0 },
  { id: "competition", label: "Competition", type: "dropdown", options: "competitions", required: true, visible: true, order: 1 },
  { id: "phase", label: "Match Phase", type: "dropdown", options: "phases", required: false, visible: true, order: 2 },
  { id: "category", label: "Category", type: "dropdown", options: "categories", required: false, visible: true, order: 3 },
  { id: "participants", label: "Participants / Match", type: "text", required: true, visible: true, order: 4 },
  { id: "content", label: "Content Description", type: "text", required: false, visible: true, order: 5 },
  { id: "startDateBE", label: "Start Date (Belgian)", type: "date", required: true, visible: true, order: 6 },
  { id: "startTimeBE", label: "Start Time (Belgian)", type: "time", required: true, visible: true, order: 7 },
  { id: "startDateOrigin", label: "Start Date (Origin)", type: "date", required: false, visible: true, order: 8 },
  { id: "startTimeOrigin", label: "Start Time (Origin)", type: "time", required: false, visible: true, order: 9 },
  { id: "complex", label: "Sports Complex", type: "dropdown", options: "complexes", required: false, visible: true, order: 10 },
  { id: "livestreamDate", label: "Livestream Date", type: "date", required: false, visible: true, order: 11 },
  { id: "livestreamTime", label: "Livestream Time", type: "time", required: false, visible: true, order: 12 },
  { id: "linearChannel", label: "Linear Channel", type: "dropdown", options: "channels", required: false, visible: true, order: 13 },
  { id: "radioChannel", label: "Radio Channel", type: "dropdown", options: "radioChannels", required: false, visible: true, order: 14 },
  { id: "linearStartTime", label: "Linear Start Time", type: "time", required: false, visible: true, order: 15 },
  { id: "isLive", label: "Live", type: "checkbox", required: false, visible: true, order: 16 },
  { id: "isDelayedLive", label: "Delayed Live", type: "checkbox", required: false, visible: true, order: 17 },
  { id: "videoRef", label: "Video File Reference", type: "text", required: false, visible: true, order: 18 },
  { id: "winner", label: "Winner", type: "text", required: false, visible: true, order: 19 },
  { id: "score", label: "Score", type: "text", required: false, visible: true, order: 20 },
  { id: "duration", label: "Actual Match Duration", type: "text", required: false, visible: true, order: 21 },
]

export const DEFAULT_CREW_FIELDS: FieldConfig[] = [
  { id: "encoder", label: "Encoder", type: "text", required: true, visible: true, order: 0 },
  { id: "reporter", label: "Reporter", type: "text", required: false, visible: true, order: 1 },
  { id: "camera", label: "Camera Operator", type: "text", required: false, visible: true, order: 2 },
  { id: "sound", label: "Sound", type: "text", required: false, visible: true, order: 3 },
  { id: "production", label: "Production", type: "text", required: false, visible: true, order: 4 },
  { id: "commentary", label: "On-site Commentary", type: "text", required: false, visible: true, order: 5 },
  { id: "director", label: "Director", type: "text", required: false, visible: true, order: 6 },
  { id: "contact", label: "Contact Person", type: "text", required: false, visible: true, order: 7 },
  { id: "isLivestream", label: "Livestream", type: "checkbox", required: false, visible: true, order: 8 },
]

export const DEFAULT_DASHBOARD_WIDGETS: Record<string, DashboardWidget[]> = {
  planner: [
    { id: "channelTimeline", label: "Channel Timeline", visible: true, order: 0 },
    { id: "liveNow", label: "Live Now", visible: true, order: 1 },
    { id: "upcomingToday", label: "Upcoming Today", visible: true, order: 2 },
    { id: "maxConditions", label: "VRT MAX Conditions", visible: true, order: 3 },
  ],
  sports: [
    { id: "sportTree", label: "Sport / Event Tree", visible: true, order: 0 },
    { id: "eventDetail", label: "Event Detail", visible: true, order: 1 },
    { id: "techPlans", label: "Technical Plans", visible: true, order: 2 },
    { id: "crewOverview", label: "Crew Overview", visible: true, order: 3 },
  ],
  contracts: [
    { id: "statusSummary", label: "Status Summary Cards", visible: true, order: 0 },
    { id: "contractTable", label: "Contract Table", visible: true, order: 1 },
    { id: "expiryAlerts", label: "Expiry Alerts", visible: true, order: 2 },
    { id: "rightsMatrix", label: "Rights Matrix", visible: true, order: 3 },
  ],
  admin: [
    { id: "systemStatus", label: "System Status", visible: true, order: 0 },
    { id: "userManagement", label: "User Management", visible: true, order: 1 },
    { id: "auditLog", label: "Audit Log", visible: true, order: 2 },
    { id: "settings", label: "Settings", visible: true, order: 3 },
  ],
}

export const INITIAL_EVENTS: Event[] = [
  { id: 1, sportId: 1, competitionId: 1, phase: "Regular Season", content: "JPL Matchday 28", participants: "Club Brugge vs Anderlecht", startDateBE: "2026-03-03", startTimeBE: "14:30", startDateOrigin: "2026-03-03", startTimeOrigin: "14:30", complex: "Jan Breydel", category: "Men", livestreamDate: "2026-03-03", livestreamTime: "14:15", linearChannel: "VRT 1", radioChannel: "Radio 1", linearStartTime: "14:20", isLive: true, isDelayedLive: false, videoRef: "WP-2026-0412", customFields: {} },
  { id: 2, sportId: 2, competitionId: 3, phase: "Semi-final", content: "US Open Women's SF", participants: "Elise Mertens vs Coco Gauff", startDateBE: "2026-03-03", startTimeBE: "21:00", startDateOrigin: "2026-03-03", startTimeOrigin: "15:00", complex: "Arthur Ashe Stadium", category: "Women", livestreamDate: "2026-03-03", livestreamTime: "20:45", linearChannel: "VRT Canvas", radioChannel: "Radio 1", linearStartTime: "20:50", isLive: true, isDelayedLive: false, videoRef: "WP-2026-0413", customFields: {} },
  { id: 3, sportId: 3, competitionId: 5, phase: "Stage", content: "Tour Stage 14 — Mountain", participants: "Wout van Aert, Tadej Pogačar, Jonas Vingegaard", startDateBE: "2026-03-04", startTimeBE: "12:00", startDateOrigin: "2026-03-04", startTimeOrigin: "12:00", complex: "Col du Tourmalet", category: "Men", livestreamDate: "2026-03-04", livestreamTime: "11:45", linearChannel: "VRT 1", radioChannel: "Radio 1", linearStartTime: "13:30", isLive: true, isDelayedLive: false, videoRef: "WP-2026-0421", customFields: {} },
  { id: 4, sportId: 1, competitionId: 2, phase: "Quarter-final", content: "UCL QF 1st Leg", participants: "Club Brugge vs Real Madrid", startDateBE: "2026-03-04", startTimeBE: "21:00", startDateOrigin: "2026-03-04", startTimeOrigin: "21:00", complex: "Jan Breydel", category: "Men", livestreamDate: "2026-03-04", livestreamTime: "20:30", linearChannel: "VRT 1", radioChannel: "Radio 1", linearStartTime: "20:45", isLive: true, isDelayedLive: false, videoRef: "WP-2026-0431", customFields: {} },
  { id: 5, sportId: 4, competitionId: 6, phase: "Regular Season", content: "F1 GP Belgium", participants: "All Drivers", startDateBE: "2026-03-05", startTimeBE: "15:00", startDateOrigin: "2026-03-05", startTimeOrigin: "15:00", complex: "Spa-Francorchamps", category: "Mixed", livestreamDate: "2026-03-05", livestreamTime: "14:30", linearChannel: "VRT 1", radioChannel: "MNM", linearStartTime: "14:45", isLive: true, isDelayedLive: false, videoRef: "WP-2026-0441", customFields: {} },
  { id: 6, sportId: 1, competitionId: 1, phase: "Regular Season", content: "JPL Matchday 28", participants: "Gent vs Standard", startDateBE: "2026-03-05", startTimeBE: "18:30", startDateOrigin: "2026-03-05", startTimeOrigin: "18:30", complex: "Ghelamco Arena", category: "Men", livestreamDate: "2026-03-05", livestreamTime: "18:15", linearChannel: "VRT Canvas", radioChannel: "Radio 1", linearStartTime: "18:20", isLive: false, isDelayedLive: true, videoRef: "WP-2026-0451", customFields: {} },
  { id: 7, sportId: 5, competitionId: 7, phase: "Final", content: "Euro Champs 100m Final", participants: "Various Athletes", startDateBE: "2026-03-06", startTimeBE: "20:45", startDateOrigin: "2026-03-06", startTimeOrigin: "20:45", complex: "Stade de France", category: "Men", livestreamDate: "2026-03-06", livestreamTime: "20:30", linearChannel: "VRT 1", radioChannel: "Radio 1", linearStartTime: "20:30", isLive: true, isDelayedLive: false, videoRef: "WP-2026-0461", customFields: {} },
]

export const INITIAL_TECH_PLANS: TechPlan[] = [
  { id: 1, eventId: 1, planType: "Sportweekend", crew: { encoder: "ENC-04", reporter: "Jan Peeters", camera: "Luc Janssen", sound: "Marie Dubois", production: "VRT Productie A", commentary: "Frank Raes", director: "Koen Wauters", contact: "info@vrt.be" }, isLivestream: true, customFields: [{ name: "Graphics Package", value: "Sporza V3" }] },
  { id: 2, eventId: 1, planType: "Sporza op Zondag", crew: { encoder: "ENC-07", reporter: "Eddy Demarez", camera: "Tom Boonen", sound: "Els Peeters", production: "VRT Productie B", commentary: "Michel Wuyts", director: "Rik Verbrugghe", contact: "sporza@vrt.be" }, isLivestream: false, customFields: [{ name: "Summary Duration", value: "8 min" }] },
  { id: 3, eventId: 2, planType: "Live Coverage", crew: { encoder: "ENC-02", reporter: "Inge Van Meensel", camera: "Dirk Meyers", sound: "Anna Leclercq", production: "VRT Productie A", commentary: "Dirk Gerlo", director: "Pascal Braeckman", contact: "tennis@vrt.be" }, isLivestream: true, customFields: [] },
  { id: 4, eventId: 3, planType: "Live Stage Coverage", crew: { encoder: "ENC-01", reporter: "Renaat Schotte", camera: "Pieter Veys", sound: "Lotte Vanderstraeten", production: "VRT Productie C", commentary: "Michel Wuyts", director: "Hans Vandeweghe", contact: "wielrennen@vrt.be" }, isLivestream: true, customFields: [{ name: "Moto Camera", value: "Yes" }, { name: "Helicopter", value: "Confirmed" }] },
  { id: 5, eventId: 4, planType: "UCL Live", crew: { encoder: "ENC-03", reporter: "Peter Vandenbempt", camera: "Luc Janssen", sound: "Marie Dubois", production: "VRT Productie A", commentary: "Filip Joos", director: "Koen Wauters", contact: "ucl@vrt.be" }, isLivestream: true, customFields: [{ name: "Pre-match Studio", value: "Yes" }] },
  { id: 6, eventId: 5, planType: "F1 Live", crew: { encoder: "ENC-05", reporter: "Sam Dejonghe", camera: "Remote Feed", sound: "Remote Feed", production: "VRT + International", commentary: "Gaston Moerman", director: "Remote", contact: "f1@vrt.be" }, isLivestream: true, customFields: [{ name: "Pit Lane Reporter", value: "TBD" }] },
]

export const CONTRACTS: Contract[] = [
  { id: 1, competitionId: 1, status: "valid", validFrom: "2024-07-01", validUntil: "2027-06-30", linearRights: true, maxRights: true, radioRights: true, geoRestriction: "Belgium only", sublicensing: false, fee: "€2.4M/year", notes: "Exclusive Belgian rights" },
  { id: 2, competitionId: 2, status: "valid", validFrom: "2024-09-01", validUntil: "2027-08-31", linearRights: true, maxRights: true, radioRights: true, geoRestriction: "Belgium only", sublicensing: false, fee: "€8.1M/year", notes: "Shared with RTBF" },
  { id: 3, competitionId: 3, status: "valid", validFrom: "2025-01-01", validUntil: "2026-12-31", linearRights: true, maxRights: false, radioRights: true, geoRestriction: "Belgium + Luxembourg", sublicensing: false, fee: "€1.2M/year", notes: "No VRT MAX streaming" },
  { id: 4, competitionId: 4, status: "expiring", validFrom: "2023-01-01", validUntil: "2026-06-30", linearRights: true, maxRights: true, radioRights: false, geoRestriction: "Belgium only", sublicensing: false, fee: "€0.9M/year", notes: "Renewal negotiations started" },
  { id: 5, competitionId: 5, status: "valid", validFrom: "2025-01-01", validUntil: "2028-12-31", linearRights: true, maxRights: true, radioRights: true, geoRestriction: "Benelux", sublicensing: true, fee: "€5.5M/year", notes: "Premium package" },
  { id: 6, competitionId: 6, status: "none", validFrom: "", validUntil: "", linearRights: false, maxRights: false, radioRights: false, geoRestriction: "", sublicensing: false, fee: "", notes: "Rights held by RTBF" },
  { id: 7, competitionId: 7, status: "draft", validFrom: "2026-01-01", validUntil: "2028-12-31", linearRights: true, maxRights: true, radioRights: true, geoRestriction: "Belgium only", sublicensing: false, fee: "TBD", notes: "In negotiation with EBU" },
]

export const ROLE_CONFIG: Record<string, import('./types').RoleConfig> = {
  planner: { label: "Network Planner", accent: "#2563eb", icon: "calendar" },
  sports: { label: "Sports Department", accent: "#059669", icon: "users" },
  contracts: { label: "Contracts Team", accent: "#d97706", icon: "file-text" },
  admin: { label: "Admin", accent: "#dc2626", icon: "settings" },
}

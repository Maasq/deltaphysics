/* --- 1. SETTINGS (Edit these for new subjects) --- */
const SUBJECT = "Physics";
const LEVEL   = "Higher";
const VERSION = "1.20.00";

/* --- 2. CALCULATIONS (Do not edit below) --- */

// A. Calculate Header
const HEADER_TEXT = `${LEVEL} ${SUBJECT}`;

// B. Calculate Database Names
// Logic: If it's the original "Higher Physics" app, keep the old DB names to preserve user data.
// For any other subject, auto-generate a unique name (e.g. "ChemistryN5AppDB").
let dbName, focusDbName;

if (SUBJECT === "Physics" && LEVEL === "Higher") {
    dbName = "PhysicsAppDB";
    focusDbName = "PhysicsFocusDB";
} else {
    // Remove spaces from subject/level for clean DB names
    const cleanSubject = SUBJECT.replace(/\s+/g, '');
    const cleanLevel = LEVEL.replace(/\s+/g, '');
    
    dbName = `${cleanSubject}${cleanLevel}AppDB`;
    focusDbName = `${cleanSubject}${cleanLevel}FocusDB`;
}

/* --- 3. EXPORT CONFIGURATION --- */
const APP_CONFIG = {
    // Identity
    subject: SUBJECT,
    level: LEVEL,
    header: HEADER_TEXT, 
    subtitle: "Multiple Choice Practice",
    version: VERSION,
    
    // Colours
    colors: {
        primary: "#800000",
        accent: "#ffbf00"
    },

    // Resources (Documents)
    resources: {
    "dataSheet": {
        "enabled": true,
        "type": "image",
        "content": "datasheet.webp"
    },
    "equationSheet": {
        "enabled": true,
        "type": "image",
        "content": "equations.webp"
    }
},

    // Databases (Calculated above)
    dbName: dbName,
    focusDbName: focusDbName,
    
    // Taxonomy
    taxonomyOrder: [
    "Our Dynamic Universe",
    "Particles and Waves",
    "Electricity",
    "Other"
],
    
    taxonomy: {
    "Our Dynamic Universe": [
        "Motion - Equations and Graphs",
        "Forces, Energy and Power",
        "Collisions, Explosions and Impulse",
        "Gravitation",
        "Special Relativity",
        "The Expanding Universe"
    ],
    "Particles and Waves": [
        "Forces on Charged Particles",
        "The Standard Model",
        "Nuclear Reactions",
        "Inverse Square Law",
        "Wave-Particle Duality",
        "Interference",
        "Spectra",
        "Refraction of Light"
    ],
    "Electricity": [
        "Monitoring and Measuring AC",
        "Current, Potential Difference, Power, and Resistance",
        "Electrical Sources and Internal Resistance",
        "Capacitors",
        "Semiconductors and p-n Junctions"
    ],
    "Other": [
        "Skills",
        "Uncertainties"
    ]
}
};
/* --- 1. SETTINGS (Edit these for new subjects) --- */
const SUBJECT = "Physics";
const LEVEL   = "National 5";
const VERSION = "1.01.00";

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
    "Dynamics",
    "Space",
    "Electricity",
    "Properties of Matter",
    "Waves",
    "Radiation",
    "Other"
],
    
    taxonomy: {
    "Dynamics": [
        "Vectors and Scalars",
        "Velocity–Time Graphs",
        "Acceleration",
        "Newton's Laws",
        "Energy",
        "Projectile Motion"
    ],
    "Space": [
        "Space Exploration",
        "Cosmology"
    ],
    "Electricity": [
        "Electrical Charge Carriers",
        "Potential Difference (Voltage)",
        "Ohm's Law",
        "Practical Electrical and Electronic Circuits",
        "Electrical Power"
    ],
    "Properties of Matter": [
        "Specific Heat Capacity",
        "Specific Latent Heat",
        "Gas Laws and the Kinetic Model"
    ],
    "Waves": [
        "Wave Parameters and Behaviours",
        "Electromagnetic Spectrum",
        "Refraction of Light"
    ],
    "Radiation": [
        "Nuclear Radiation"
    ],
    "Other": [
        "Non Specific"
    ]
}
};
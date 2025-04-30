/**
 * Detailed instructions for parsing violations based on the schema
 */

const violationParsingInstructions = {
  violationTypes: [
    'AIRSTRIKE', 'CHEMICAL_ATTACK', 'DETENTION', 'DISPLACEMENT', 
    'EXECUTION', 'SHELLING', 'SIEGE', 'TORTURE', 'MURDER', 
    'SHOOTING', 'HOME_INVASION', 'EXPLOSION', 'AMBUSH', 'KIDNAPPING', 'OTHER'
  ],

  perpetratorAffiliations: [
    'assad_regime', 'post_8th_december_government', 'various_armed_groups', 
    'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia', 
    'iran_shia_militias', 'unknown'
  ],

  certaintyLevels: ['confirmed', 'probable', 'possible'],

  genderTypes: ['male', 'female', 'other', 'unknown'],

  victimStatuses: ['civilian', 'combatant', 'unknown'],

  fieldInstructions: {
    type: `
      Categorize the violation type based on the primary action described.
      - AIRSTRIKE: Attacks from aircraft
      - CHEMICAL_ATTACK: Use of chemical weapons
      - DETENTION: Arbitrary arrests or detentions
      - DISPLACEMENT: Forced movement of civilians
      - EXECUTION: Formal or informal executions
      - SHELLING: Artillery or rocket attacks
      - SIEGE: Blockades preventing access to necessities
      - TORTURE: Intentional infliction of severe pain
      - MURDER: Intentional killings outside of combat
      - SHOOTING: Gun-related violence
      - HOME_INVASION: Forced entry into civilian homes
      - EXPLOSION: Bombs, IEDs, or other explosive devices
      - AMBUSH: Surprise attacks on military or civilians
      - KIDNAPPING: Abduction of individuals
      - OTHER: Violations not fitting other categories
    `,

    date: `
      Extract the date when the violation occurred.
      - Format as YYYY-MM-DD
      - If only month/year is known, use the first day of the month
      - If date is ambiguous, use the earliest date mentioned
      - If only a range is given, use the start date
      - Cannot be in the future
    `,

    location: `
      Extract both specific location and administrative division.
      - Name should be the specific location (neighborhood, town, city)
      - Administrative division should be the governorate/province
      - Provide both English and Arabic names when possible
      - Translate from one language to the other if only one is provided
    `,

    description: `
      Summarize the key details of the violation in 3-5 sentences.
      - Include who, what, when, where, how
      - Focus on factual information rather than commentary
      - Include key contextual information
      - Between 10 and 2000 characters
      - Provide in both English and Arabic
    `,

    perpetrator: `
      Identify the specific group or entity responsible.
      - Be as specific as possible (e.g., "14th Division of SAA" rather than just "Syrian Army")
      - If multiple perpetrators, list all with commas
      - Max 200 characters
      - Provide in both English and Arabic
    `,

    perpetrator_affiliation: `
      Categorize the perpetrator into one of the predefined affiliations:
      - assad_regime: Syrian government forces and aligned militias
      - post_8th_december_government: Government after December 8, 2023
      - various_armed_groups: Local armed groups
      - isis: Islamic State/Daesh
      - sdf: Syrian Democratic Forces
      - israel: Israeli forces
      - turkey: Turkish forces
      - druze_militias: Druze militias
      - russia: Russian forces
      - iran_shia_militias: Iranian forces or Shia militias
      - unknown: When perpetrator is unclear
    `,

    certainty_level: `
      Assess the reliability of the information:
      - confirmed: Multiple credible sources, official documentation, or verified media
      - probable: Single credible source with specific details
      - possible: Unconfirmed reports or limited information
    `,

    victims: `
      Extract details about individual victims when available:
      - Age: Numeric age (0-120) or null if unknown
      - Gender: male, female, other, unknown
      - Status: civilian, combatant, unknown
      - Group affiliation: Political, military, or social group the victim belongs to
      - Sectarian identity: Religious or ethnic identity if relevant
      - Death date: Date of death if different from violation date (YYYY-MM-DD)
    `,

    tags: `
      Add relevant categorical tags to help with searching and filtering:
      - Location-based tags (e.g., "Rural Damascus")
      - Demographic tags (e.g., "Children", "Women", "Elderly")
      - Method tags (e.g., "Barrel Bombs", "Sniper")
      - Target tags (e.g., "Hospital", "School", "Marketplace")
      - Max 50 characters per tag
      - Provide in both English and Arabic
    `
  }
};

module.exports = violationParsingInstructions;
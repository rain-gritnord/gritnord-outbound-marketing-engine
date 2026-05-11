// Maps location strings to language codes and display names
// Used by uc-researcher.js (Claude prompt language) and video-generator.js (ElevenLabs model)

const COUNTRY_LANGUAGE_MAP = [
  // Nordic
  { patterns: ['finland', 'helsinki', 'tampere', 'espoo', 'turku', 'oulu'],          code: 'fi', name: 'Finnish',    elevenlabs: 'fi' },
  { patterns: ['sweden', 'stockholm', 'gothenburg', 'malmö', 'malmo'],                code: 'sv', name: 'Swedish',    elevenlabs: 'sv' },
  { patterns: ['norway', 'oslo', 'bergen', 'trondheim'],                              code: 'no', name: 'Norwegian',  elevenlabs: 'no' },
  { patterns: ['denmark', 'copenhagen', 'aarhus', 'odense'],                          code: 'da', name: 'Danish',     elevenlabs: 'da' },

  // Baltic — use multilingual v2 which handles these better than the English-only turbo model
  { patterns: ['estonia', 'tallinn', 'tartu', 'pärnu', 'parnu'],                     code: 'et', name: 'Estonian',   elevenlabs: 'et' },
  { patterns: ['latvia', 'riga'],                                                      code: 'lv', name: 'Latvian',    elevenlabs: 'lv' },
  { patterns: ['lithuania', 'vilnius', 'kaunas'],                                     code: 'lt', name: 'Lithuanian', elevenlabs: 'lt' },

  // Western Europe
  { patterns: ['germany', 'berlin', 'munich', 'münchen', 'hamburg', 'frankfurt'],    code: 'de', name: 'German',     elevenlabs: 'de' },
  { patterns: ['netherlands', 'amsterdam', 'rotterdam', 'the hague', 'eindhoven'],   code: 'nl', name: 'Dutch',      elevenlabs: 'nl' },
  { patterns: ['france', 'paris', 'lyon', 'marseille', 'toulouse'],                  code: 'fr', name: 'French',     elevenlabs: 'fr' },
  { patterns: ['spain', 'madrid', 'barcelona', 'valencia', 'seville'],               code: 'es', name: 'Spanish',    elevenlabs: 'es' },
  { patterns: ['italy', 'rome', 'milan', 'naples', 'turin'],                         code: 'it', name: 'Italian',    elevenlabs: 'it' },
  { patterns: ['poland', 'warsaw', 'krakow', 'kraków', 'wroclaw'],                   code: 'pl', name: 'Polish',     elevenlabs: 'pl' },
  { patterns: ['portugal', 'lisbon', 'porto'],                                        code: 'pt', name: 'Portuguese', elevenlabs: 'pt' },

  // English-speaking — always English
  { patterns: ['uk', 'united kingdom', 'london', 'manchester', 'birmingham'],        code: 'en', name: 'English',    elevenlabs: 'en' },
  { patterns: ['ireland', 'dublin'],                                                  code: 'en', name: 'English',    elevenlabs: 'en' },
  { patterns: ['usa', 'united states', 'new york', 'san francisco', 'chicago'],      code: 'en', name: 'English',    elevenlabs: 'en' },
  { patterns: ['canada', 'toronto', 'vancouver'],                                     code: 'en', name: 'English',    elevenlabs: 'en' },
  { patterns: ['australia', 'sydney', 'melbourne'],                                   code: 'en', name: 'English',    elevenlabs: 'en' },
];

const DEFAULT_LANGUAGE = { code: 'en', name: 'English', elevenlabs: 'en' };

export function detectLanguage(location) {
  if (!location) return DEFAULT_LANGUAGE;
  const lower = location.toLowerCase();
  for (const entry of COUNTRY_LANGUAGE_MAP) {
    if (entry.patterns.some(p => lower.includes(p))) {
      return { code: entry.code, name: entry.name, elevenlabs: entry.elevenlabs, note: entry.note };
    }
  }
  return DEFAULT_LANGUAGE;
}

const LANGUAGE_WRITING_RULES = {
  fi: `Write in natural, professional Finnish as a native Finnish business person would write — not as a translation from English.
RULES:
- Never add Finnish grammatical suffixes to English words (not "lean'ina", not "outbound'ia", not "pipeline'ia")
- Industry terms (AI, SaaS, CRM, pipeline) stay in English as-is, no modification
- Use Finnish business vocabulary: "myyntiputki" not "pipeline", "kylmäkontaktointi" not "cold outreach", "tapaamisten buukkaus" not "meeting booking"
- Tone: direct, warm, respected peer — not salesy, not formal bureaucratic Finnish
- Short sentences. Natural rhythm. Like a LinkedIn message from a sharp Finnish founder.`,

  sv: `Write in natural, professional Swedish as a native Swedish business person would write.
RULES:
- Never add Swedish suffixes to English words (not "lean:en", not "outbound:en")
- Industry terms (AI, SaaS, CRM) stay in English as-is
- Tone: direct, collegial, Scandinavian understatement — never oversell
- Natural Swedish business register, not translated English`,

  et: `Write in natural, professional Estonian as a native Estonian business professional would write — absolutely not as a translation from English.
RULES:
- NEVER add Estonian case suffixes to English words. Not "lean'ina", not "outbound'i ajama", not "pipeline'i". These sound amateur and will immediately mark the message as machine-generated.
- Industry terms (AI, SaaS, CRM, pipeline, outbound) stay in English as standalone words with no modification. Write "outbound" not "outbound'i".
- NO dashes (— or -) in the middle of sentences. Never use em dash as a connector mid-sentence. Use a period or rewrite the sentence instead. "Rain, nägin et ehitad Gritnordi lean — AI asendab BDR-i" is wrong. Write two sentences instead.
- Use natural Estonian business phrases: "müügikoosolekuid" for sales meetings, "väljaminev müük" for outbound, "müügitoru" for pipeline, "automaatika" for automation.
- Tone: direct, peer-to-peer, no corporate stiffness. Estonian business culture values brevity and directness.
- Short sentences. One idea per sentence. Never connect two clauses with a dash.
- The email subject line must be grammatically perfect Estonian — no anglicisms with suffixes.
- Read each sentence aloud mentally: if it sounds like Google Translate or has a mid-sentence dash, rewrite it.`,

  de: `Write in natural, professional German (Duzen — "du" form, not "Sie") as a native German startup founder would write.
RULES:
- English tech terms (AI, SaaS, Pipeline, Outreach) are used as-is in German startup culture — no translation needed
- Avoid Germanic compound word overload — keep sentences crisp
- Tone: direct, startup-register, peer founder voice — not formal Hochdeutsch`,

  nl: `Write in natural, professional Dutch as a native Dutch business professional would write.
RULES:
- English tech terms stay in English — Dutch startup culture uses them freely
- Tone: direct, informal but professional, collegial
- No machine-translated feel`,

  fr: `Write in natural, professional French (tutoiement — "tu" form for startup/founder context) as a native would write.
RULES:
- English tech terms (AI, SaaS, pipeline) stay in English
- Avoid overly formal French — use the register of a sharp Parisian startup founder
- Tone: confident, collegial, intellectually direct`,

  pl: `Write in natural, professional Polish as a native Polish business professional would write.
RULES:
- English tech terms (AI, SaaS, pipeline, outreach) stay in English as-is
- Never add Polish declension endings to English words
- Tone: direct, respectful peer — Polish business culture values substance over relationship-building preamble`,

  da: `Write in natural, professional Danish as a native Danish business person would write.
RULES:
- English tech terms stay in English
- Tone: informal, egalitarian, Scandinavian directness — no hierarchy implied`,

  no: `Write in natural, professional Norwegian (Bokmål) as a native would write.
RULES:
- English tech terms stay in English
- Tone: direct, Scandinavian peer register`,
};

export function getLanguageInstruction(lang) {
  if (lang.code === 'en') return 'Write everything in English. Professional, direct, sharp — no filler words.';

  const rules = LANGUAGE_WRITING_RULES[lang.code] || '';
  return `Write the video script, LinkedIn DM, voice note script, and email subject in ${lang.name}.
Pain angle and fit reason write in English (for Rain's internal reference).

QUALITY STANDARD: This must read at 5-star professional native-speaker level. A ${lang.name}-speaking founder must read this and think it was written by someone who speaks ${lang.name} natively. If it reads like a translation, it will be ignored.

${rules}

After writing, review each output and ask: "Does this sound like something a sharp ${lang.name} founder would actually write to a peer?" If not, rewrite it.`;
}

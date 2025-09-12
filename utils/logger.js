// utils/logger.js
const isProd = process.env.NODE_ENV === 'production';

export const log = (...args) => {
  if (!isProd) console.log('[LOG]', ...args);
};
export const warn = (...args) => console.warn('[WARN]', ...args);
export const error = (...args) => console.error('[ERROR]', ...args);

// exemple a utiliser dans un fichier React Native
// import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )
// )

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )
// )
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);

// console.log(`🚀 ~ import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// :`, import { log } from "../utils/logger";

// log("[ONBOARD] email =", email);
// )
// )
// )

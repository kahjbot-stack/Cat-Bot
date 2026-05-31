import type { AppCtx } from '@/engine/types/controller.types.js'
import { Role } from '@/engine/constants/role.constants.js'
import { MessageStyle } from '@/engine/constants/message-style.constants.js'
import type { CommandConfig } from '@/engine/types/module-config.types.js'
import { OptionType } from '@/engine/modules/command/command-option.constants.js'

export const config: CommandConfig = {
  name: 'dox',
  version: '1.0.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  category: 'Fun',
  description: 'Generate a fake dox for a user (fun only, no real data collected)',
  usage: '[userID | @mention | (reply to a message)]',
  cooldown: 10,
  hasPrefix: true,
  options: [
    {
      type: OptionType.string,
      name: 'target',
      description: '@mention, userID, or reply to look up',
      required: false,
    },
  ],
}

/**
 * Cat‑Bot command handler for the `dox` command.
 * Generates a fake dox report for the targeted user (or the invoker).
 *
 * @param chat       - The chat API context for sending replies.
 * @param args       - Space‑separated tokens following the command name.
 * @param event      - The raw unified event object.
 * @param user       - User API for looking up display names.
 * @param native     - Information about the current platform and session.
 */
export const onCommand = async ({ chat, args, event, user, native }: AppCtx) => {
  const target = getTarget(args, event)
  const displayName = (await user.getName(target)) ?? target

  const fakeData = generateFakeData(displayName)

  const doxMessage = formatDoxMessage(displayName, target, fakeData, native.platform)

  await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: doxMessage,
  })
}

/**
 * Resolves the target user ID using the following priority:
 * 1. Explicity user ID passed as the first argument.
 * 2. First mentioned user in the message.
 * 3. Original message sender if the command was invoked as a reply.
 * 4. Falls back to the message author (self‑dox).
 *
 * @param args  - Tokenised command arguments.
 * @param event - The unified event object.
 * @returns A platform‑specific user ID to generate the fake dox for.
 */
function getTarget(args: string[], event: Record<string, unknown>): string {
  // 1. If a user ID is passed as the first argument
  if (args.length > 0) return args[0]!

  // 2. If the message mentions any users, pick the first
  const mentions = event['mentions'] as Record<string, string> | undefined
  if (mentions) {
    const ids = Object.keys(mentions)
    if (ids.length > 0) return ids[0]!
  }

  // 3. If the message is a reply to another user, target that user
  const reply = event['messageReply'] as { senderID?: string } | undefined
  if (reply?.senderID) return reply.senderID

  // 4. Fallback to the sender (dox yourself)
  return event['senderID'] as string
}

/**
 * Creates a complete set of randomised fake data for the dox report.
 * Uses the target’s display name to generate a plausible email address.
 *
 * @param userName - The display name of the target user.
 * @returns An object containing all fabricated fields used in the dox message.
 */
function generateFakeData(userName: string) {
  const country = pickRandom(COUNTRIES)
  const speed = (Math.random() * 0.5 + 0.1).toFixed(2)
  const ip = generateGlobalIP()
  const ipv6 = generateRandomIPv6()
  const ssn = Math.floor(Math.random() * 1e16).toString()
  const email = generateFakeEmail(userName)
  const os = pickRandom(OS_LIST)
  const browser = pickRandom(BROWSER_LIST)

  return {
    speed,
    ip,
    ipv6,
    mac: generateRandomMac(),
    isp: pickRandom(ISP_LIST),
    country,
    city: pickRandom(CITIES),
    region: pickRandom(REGIONS),
    dns: generateRandomDNS(),
    ssn,
    email,
    os,
    browser,
    latitude: (-90 + Math.random() * 180).toFixed(6),
    longitude: (-180 + Math.random() * 360).toFixed(6),
    connectionSpeed: `${randomInt(10, 1000)} Mbps`,
    connectionType: pickRandom(['Fibre', 'ADSL', '4G', '5G', 'Satellite']),
    proxy: pickRandom(['None', 'HTTP', 'SOCKS5', 'VPN Active']),
    timezone: pickRandom(TIMEZONES),
    cookie: randomInt(50, 500),
    activeSession: `${randomInt(1, 24)}h ${randomInt(1, 59)}m`,
    lastAccess: generateRandomDate(),
    risk: pickRandom(['Low', 'Medium', 'High', 'Extreme']),
  }
}

/**
 * Generates a random IPv4 address (not necessarily valid, purely cosmetic).
 *
 * @returns A string like `192.168.1.1`.
 */
function generateGlobalIP(): string {
  return `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`
}

/**
 * Formats the final fake dox message using consistent Markdown styling.
 *
 * @param name     - The display name of the target.
 * @param userId   - The raw platform user ID.
 * @param data     - All randomly generated fake details.
 * @param platform - The platform identifier (e.g. `discord`, `telegram`).
 * @returns A Markdown string ready to be sent via `chat.replyMessage`.
 */
function formatDoxMessage(
  name: string,
  userId: string,
  data: ReturnType<typeof generateFakeData>,
  platform: string,
) {
  return `*[ ✔ ] DOX COMPLETED!*
⏳ Time elapsed: ${data.speed} seconds

*🎯 PERSONAL INFORMATION:*
• Name: ${name}
• User ID: ${userId}
• Email: ${data.email}
• SSN: ${data.ssn}

*📱 DEVICE & PLATFORM:*
• Platform: ${platform}
• OS: ${data.os}
• Browser/Client: ${data.browser}
• Last access: ${data.lastAccess}
• Active session: ${data.activeSession}

*🌐 NETWORK INFORMATION:*
• IP: ${data.ip}
• IPv6: ${data.ipv6}
• MAC: ${data.mac}
• ISP: ${data.isp}
• DNS: ${data.dns.primary} / ${data.dns.secondary}
• Gateway: 192.168.1.1
• Speed: ${data.connectionSpeed}
• Connection: ${data.connectionType}
• Proxy/VPN: ${data.proxy}

*📍 GEOLOCATION:*
• Country: ${data.country}
• Region: ${data.region}
• City: ${data.city}
• Coordinates: ${data.latitude}°N, ${data.longitude}°E
• Timezone: ${data.timezone}

*🔒 SECURITY:*
• Open ports: 80, 443, 8080, 21, 22
• Ban risk: ${data.risk}
• Firewall: ${pickRandom(['Active', 'Inactive', 'Partial'])}
• Antivirus: ${pickRandom(['Windows Defender', 'Avast', 'Norton', 'Kaspersky', 'None'])}
• Cookie WA: ${data.cookie}`
}

// ─── Utility helpers ──────────────────────────────────────────────

/**
 * Returns a random element from a non‑empty array.
 *
 * @param arr - The source array.
 * @throws Error if the array is empty.
 * @returns A single element.
 */
function pickRandom<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('pickRandom called with empty array')
  return arr[Math.floor(Math.random() * arr.length)]!
}

/**
 * Produces a random integer in the inclusive range [min, max].
 *
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns Random integer between min and max.
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Generates a random IPv6 address string (eight 16‑bit hex blocks).
 *
 * @returns A full IPv6 address like `2001:db8::1`.
 */
function generateRandomIPv6(): string {
  return Array.from({ length: 8 }, () =>
    randomInt(0, 65535).toString(16).padStart(4, '0'),
  ).join(':')
}

/**
 * Generates a random MAC address (six colon‑separated hex pairs).
 *
 * @returns A MAC address like `00:1A:2B:3C:4D:5E`.
 */
function generateRandomMac(): string {
  return Array.from({ length: 6 }, () =>
    randomInt(0, 255).toString(16).padStart(2, '0').toUpperCase(),
  ).join(':')
}

/**
 * Generates a random primary and secondary DNS server pair,
 * ensuring the two values are different.
 *
 * @returns An object with `primary` and `secondary` fields.
 */
function generateRandomDNS(): { primary: string; secondary: string } {
  const primary = pickRandom(DNS_LIST)
  let secondary: string
  do {
    secondary = pickRandom(DNS_LIST)
  } while (secondary === primary)
  return { primary, secondary }
}

/**
 * Creates a fake email address based on the user’s display name.
 * The address consists of the lower‑cased name (spaces removed) +
 * random digits, followed by a randomly chosen provider domain.
 *
 * @param name - The display name of the target user.
 * @returns A synthetic email like `john123@gmail.com`.
 */
function generateFakeEmail(name: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'proton.me', 'hotmail.com']
  const cleanName = name.toLowerCase().replace(/\s+/g, '')
  const username = `${cleanName}${randomInt(10, 999)}`
  return `${username}@${pickRandom(domains)}`
}

/**
 * Generates a random recent date and time string (up to 30 days ago).
 *
 * @returns A formatted date like `Sun 15 Jan, 14:30`.
 */
function generateRandomDate(): string {
  const now = new Date()
  const date = new Date(now.getTime() - randomInt(0, 30) * 86_400_000)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}, ${String(
    date.getHours(),
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// ─── Global data lists (includes Philippines) ─────────────────────
const ISP_LIST = [
  'Comcast', 'AT&T', 'Verizon', 'Deutsche Telekom',
  'Orange', 'Vodafone', 'Telefónica', 'NTT',
  'PLDT', 'Globe Telecom', 'Smart Communications',  // Philippines
  'Bharti Airtel', 'China Telecom', 'Vivo',
]

const COUNTRIES = [
  'United States', 'Germany', 'France', 'Italy',
  'Japan', 'Canada', 'Brazil', 'Australia',
  'Philippines', 'India', 'United Kingdom', 'Mexico',
]

const CITIES = [
  'New York', 'Berlin', 'Paris', 'Rome',
  'Tokyo', 'Toronto', 'São Paulo', 'Sydney',
  'Manila', 'Mumbai', 'London', 'Mexico City',
]

const REGIONS = [
  'California', 'Bavaria', 'Île-de-France', 'Lazio',
  'Kanto', 'Ontario', 'São Paulo', 'New South Wales',
  'National Capital Region', 'Maharashtra', 'England', 'CDMX',
]

const DNS_LIST = [
  '8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1',
  '9.9.9.9', '208.67.222.222', '208.67.220.220',
]

const OS_LIST = [
  'Windows 11 (24H2)', 'macOS Sequoia 15', 'Ubuntu 24.04 LTS',
  'Android 16', 'iOS 18', 'HarmonyOS NEXT',
  'ChromeOS 120', 'Fedora 41',
]

const BROWSER_LIST = [
  'Chrome 126', 'Firefox 132', 'Edge 126',
  'Safari 18', 'Opera 114', 'Brave 1.70',
]

const TIMEZONES = [
  'America/New_York', 'Europe/Berlin', 'Europe/Paris',
  'Europe/Rome', 'Asia/Tokyo', 'America/Toronto',
  'America/Sao_Paulo', 'Australia/Sydney', 'Asia/Manila',
  'Asia/Kolkata', 'Europe/London', 'America/Mexico_City',
]
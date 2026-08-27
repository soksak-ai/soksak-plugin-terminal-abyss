export type Locale = "ko" | "en";

const MESSAGES = {
  "terminal.param.view": {
    en: "Target view id (omit = the caller's pane, or the only screen open)",
    ko: "대상 뷰 id (생략 = 호출자의 pane, 또는 열려 있는 유일한 화면)",
  },
  "terminal.param.cmd": { en: "Command line to run", ko: "실행할 명령 줄" },
  "terminal.exec.description": {
    en: "Run a command line in this terminal. Returns as soon as it is sent.",
    ko: "이 터미널에서 명령을 실행합니다. 보낸 직후 반환합니다.",
  },
  "terminal.cwd.description": {
    en: "The working directory this terminal's shell last reported.",
    ko: "이 터미널의 셸이 마지막으로 보고한 작업 디렉터리입니다.",
  },
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function t(key: MessageKey, locale: string): string {
  const entry = MESSAGES[key];
  return locale.startsWith("ko") ? entry.ko : entry.en;
}

export function sentence(key: MessageKey): { en: string; ko: string } {
  return MESSAGES[key];
}

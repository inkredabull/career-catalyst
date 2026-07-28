// Personal message templates — copy to messages.ts and fill in real content.
// messages.ts is gitignored; this file is the committed reference shape.

export const KEY_ACCOMPLISHMENTS: readonly string[] = [
  'TODO_ACCOMPLISHMENT_1',
  'TODO_ACCOMPLISHMENT_2',
  'TODO_ACCOMPLISHMENT_3',
  'TODO_ACCOMPLISHMENT_4',
];

export function addValue(): string { return 'TODO_ADD_VALUE_MSG'; }
export function whileSearching(): string { return 'TODO_WHILE_SEARCHING_MSG'; }
export function specialty(): string { return 'TODO_SPECIALTY_MSG'; }
export function knowAnyone(): string { return 'TODO_KNOW_ANYONE_MSG'; }
export function followup(): string { return 'TODO_FOLLOWUP_MSG'; }
export function who(): string { return 'TODO_WHO_MSG'; }
export function idealAsLeadership(): string { return 'TODO_IDEAL_LEADERSHIP_MSG'; }
export function idealAsBuilder(): string { return 'TODO_IDEAL_BUILDER_MSG'; }
export function whatAndWhere(): string { return 'TODO_WHAT_AND_WHERE_MSG'; }
export function rationale(): string { return 'TODO_RATIONALE_MSG'; }
export function aboutMe(): string { return 'TODO_ABOUT_ME_MSG'; }
export function why(): string { return 'TODO_WHY_MSG'; }
export function focus(): string { return 'TODO_FOCUS_MSG'; }
export function cmf(): string { return 'TODO_CMF_MSG'; }
export function mnookin(): string { return 'TODO_MNOOKIN_MSG'; }
export function li(): string { return 'TODO_LI_MSG'; }
export function appreciate(): string { return 'TODO_APPRECIATE_MSG'; }
export function connection(_personName?: string, _personUrl?: string): string { return 'TODO_CONNECTION_MSG'; }
export function intro(_personName?: string, _jobTitle?: string, _blurb?: string): string { return 'TODO_INTRO_MSG'; }
export function long(): string { return 'TODO_LONG_MSG'; }
export function shot(): string { return 'TODO_SHOT_MSG'; }
export function hope(): string { return 'TODO_HOPE_MSG'; }
export function thanks(): string { return 'TODO_THANKS_MSG'; }
export function indeed(): string { return 'TODO_INDEED_MSG'; }
export function favor(): string { return 'TODO_FAVOR_MSG'; }
export function spam(): string { return 'TODO_SPAM_MSG'; }
export function cal(): string { return 'TODO_CAL_MSG'; }
export function update(): string { return 'TODO_UPDATE_MSG'; }
export function bridge(): string { return 'TODO_BRIDGE_MSG'; }
export function repetitive(): string { return 'TODO_REPETITIVE_MSG'; }
export function greeting(): string { return 'TODO_GREETING_MSG'; }
export function personalization(): string { return 'TODO_PERSONALIZATION_MSG'; }
export function accomplishments(index: number): string { return KEY_ACCOMPLISHMENTS[index] ?? ''; }
export function ideal(): string { return 'TODO_IDEAL_ROLE_MSG'; }
export function reciprocate(): string { return 'TODO_RECIPROCATE_MSG'; }
export function subject(): string { return 'TODO_SUBJECT'; }
export function noemail(): string { return 'TODO_NOEMAIL'; }
export function thisYear(): string { return String(new Date().getFullYear()); }
export function todayAbbreviated(): string {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()] ?? '';
}
export function valediction(_subjectLine?: string): string { return 'TODO_VALEDICTION_MSG'; }
export function ask(): string { return 'TODO_ASK_MSG'; }
export function justification(): string { return 'TODO_JUSTIFICATION_MSG'; }

/**
 * 画面に出す日時の書式をここに集める。
 *
 * 時刻だけだと「今日の話なのか昨日の話なのか」が分からず、
 * 前日から動いているハッカソンでは読み違えるため、月日を必ず添える。
 */

/** 例: 8月11日 14:30 */
export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hour}:${minute}`;
}

/** 例: 8/11 14:30（横幅が狭い一覧向け） */
export function formatShortDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${hour}:${minute}`;
}

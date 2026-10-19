/** 消息层与输入框之间的最小桥：把「编辑重发」的文本送回 Composer。 */
type PrefillHandler = (text: string) => void;

let handler: PrefillHandler | null = null;

export function setPrefillHandler(next: PrefillHandler | null): void {
  handler = next;
}

export function prefillComposer(text: string): void {
  handler?.(text);
}
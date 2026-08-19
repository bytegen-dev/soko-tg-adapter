import { GrammyError, type Context, type InlineKeyboard } from "grammy";

type EditMessageOptions = {
  parse_mode?: "HTML";
  reply_markup?: InlineKeyboard;
};

export function isMessageNotEditable(error: unknown): boolean {
  return (
    error instanceof GrammyError &&
    error.error_code === 400 &&
    error.description.includes("message can't be edited")
  );
}

/** Edit a bot message; fall back to a new reply if Telegram rejects the edit. */
export async function editMessageOrReply(
  ctx: Context,
  message: { chat: { id: number }; message_id: number },
  text: string,
  options?: EditMessageOptions,
): Promise<void> {
  try {
    await ctx.api.editMessageText(
      message.chat.id,
      message.message_id,
      text,
      options,
    );
  } catch (error) {
    if (!isMessageNotEditable(error)) {
      throw error;
    }
    await ctx.reply(text, options);
  }
}

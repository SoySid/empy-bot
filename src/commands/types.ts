import { WASocket, proto } from "@whiskeysockets/baileys";
import { UserProfileWithFacts } from "../services/db/user.service.js";

export interface CommandContext {
  sock: WASocket;
  msg: proto.IWebMessageInfo;
  remoteJid: string;
  body: string;
  args: string[];
  cleanText: string;
  senderProfile?: UserProfileWithFacts;
  quotedSenderProfile?: UserProfileWithFacts;
  contextInfo?: proto.IContextInfo | null;
  quotedMsg?: proto.IMessage | null;
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  execute: (ctx: CommandContext) => Promise<void>;
}
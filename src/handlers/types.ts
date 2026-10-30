import { WASocket, proto } from "@whiskeysockets/baileys";
import { UserProfileWithFacts } from "../services/db/user.service.js";

export interface MessageContext {
  sock: WASocket;
  msg: proto.IWebMessageInfo;
  remoteJid: string;
  body: string;
  cleanBody: string;
  senderProfile: UserProfileWithFacts;
  quotedSenderProfile?: UserProfileWithFacts;
  contextInfo?: proto.IContextInfo | null;
  quotedMsg?: proto.IMessage | null;
  quotedParticipant: string;
  quotedSnippet: string;
  mentionedJidList: string[];
  botDigits: string;
  botLidDigits: string;
  hasMedia?: boolean;
  hasQuotedMedia?: boolean;
}

export type Conversation = {
  id: string;
  status: "open" | "closed";
  ai_enabled: boolean;
  assignee_id: string | null;
  assignee_name: string | null;
  last_message_at: string;
  unread_count: number;
  favorite: boolean;
  contact: { id: string; name: string | null; phone_number: string };
  channel: { id: string; name: string };
  tags: { id: string; name: string; color: string }[];
  last_message: { content: string | null; direction: "in" | "out"; by_ai: boolean; status: string } | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  content: string | null;
  by_ai: boolean;
  status: string;
  timestamp: string;
};

export type Member = { id: string; name: string };
export type ChannelRef = { id: string; name: string };

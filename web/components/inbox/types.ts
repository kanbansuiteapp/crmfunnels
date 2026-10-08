export type Conversation = {
  id: string;
  assignee_id: string | null;
  last_message_at: string;
  contact: { id: string; name: string | null; phone_number: string } | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  content: string | null;
  status: string;
  timestamp: string;
};

export type Member = { id: string; name: string };

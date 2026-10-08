export type Conversation = {
  id: string;
  assignee_id: string | null;
  last_message_at: string;
  contact: { name: string | null; phone_number: string } | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  content: string | null;
  status: string;
  timestamp: string;
};

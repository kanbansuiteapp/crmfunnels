export type Stage = { id: string; name: string; order_position: number };

export type Deal = {
  id: string;
  stage_id: string;
  title: string;
  value: number;
  position: number;
  assignee_id: string | null;
  contact: { name: string | null; phone_number: string } | null;
};

export type Agent = { id: string; name: string };

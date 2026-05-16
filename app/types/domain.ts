export type User = {
  id: string;
  waId: string;
  phone: string;
  profileName: string;
  optedIn: boolean;
  onboardingComplete: boolean;
  onboardingStep: number;
  createdAt: string;
  updatedAt: string;
};

export type InboundMessage = {
  id: string;
  userId: string;
  body: string;
  receivedAt: string;
};

export type Game = {
  id: string;
  title: string;
  scheduledAt: string;
  status: "open" | "full" | "cancelled";
};

export type Database = {
  users: User[];
  games: Game[];
  messages: InboundMessage[];
};

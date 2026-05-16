export type ActiveFlow = "favorites" | null;

export type User = {
  id: string;
  waId: string;
  phone: string;
  profileName: string;
  optedIn: boolean;
  onboardingComplete: boolean;
  onboardingStep: number;
  activeFlow: ActiveFlow;
  favoritePlayerPhones: string[];
  createdAt: string;
  updatedAt: string;
};

export type Player = {
  phone: string;
  name: string;
};

export type MessageDirection = "in" | "out";

export type Message = {
  id: string;
  userId: string;
  body: string;
  direction: MessageDirection;
  at: string;
};

export type Game = {
  id: string;
  title: string;
  scheduledAt: string;
  status: "open" | "full" | "cancelled";
};

export type Database = {
  users: User[];
  players: Player[];
  games: Game[];
  messages: Message[];
};

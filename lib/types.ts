export interface Session {
  id: string;
  date: string;
  time: string;
  trial: boolean;
}

export interface Payment {
  id: string;
  date: string;
  package: string;
  amount: number;
  sessions: number;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  trialDate: string;
  comment: string;
  totalSessions: number;
  package: string;
  packagePrice: number;
  paid: number;
  status: 'active' | 'trial';
  note: string;
  firstPaidDate: string;
  sessions: Session[];
  payments: Payment[];
}

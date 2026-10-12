export interface Order {
  id: string;
  total: number;
  updatedAt: number;
}

export interface OrderLine {
  sku: string;
  qty: number;
}

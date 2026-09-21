
export type ExpenseCategory =
    | "飲食" | "生活用品" | "教育" | "醫療" | "保險"
    | "交通" | "娛樂" | "水電費" | "一般稅務" | "公關費"
    | "通訊費" | "治裝費" | "房貸";

export type PaymentMethod = "Cash" | "CreditCard" | "Digital";

export interface Expense {
    id: string;
    date: Date; // Stored as ISO string in local storage, parsed to Date
    category: ExpenseCategory;
    itemName: string;
    amount: number;
    paymentMethod: PaymentMethod;
}

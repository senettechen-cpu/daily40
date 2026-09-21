
import { ExpenseCategory, PaymentMethod } from "../types/ledger";

interface CategoryDetail {
    label: string;
    icon: string; // Lucide icon name or description
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, CategoryDetail> = {
    "飲食": { label: "飲食 (Organic Rations)", icon: "Utensils" },
    "生活用品": { label: "生活用品 (Logistics Maint.)", icon: "Package" },
    "教育": { label: "教育 (Indoctrination)", icon: "Book" },
    "醫療": { label: "醫療 (Biological Repair)", icon: "Cross" },
    "保險": { label: "保險 (Emperor's Mercy)", icon: "Shield" },
    "交通": { label: "交通 (Troop Deployment)", icon: "Truck" },
    "娛樂": { label: "娛樂 (Morale Boost)", icon: "Smile" },
    "水電費": { label: "水電費 (Reactor Fuel)", icon: "Zap" },
    "一般稅務": { label: "一般稅務 (Imperial Tithe)", icon: "Scroll" },
    "公關費": { label: "公關費 (Diplomacy)", icon: "Handshake" },
    "通訊費": { label: "通訊費 (Astropathic Link)", icon: "Radio" },
    "治裝費": { label: "治裝費 (Wargear Maint.)", icon: "Shirt" },
    "房貸": { label: "房貸 (Hive Habitation Tithe)", icon: "Home" }
};

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
    "Cash": "硬通貨 (Hard Currency)",
    "CreditCard": "信用數據板 (Credit Slate)",
    "Digital": "機魂轉帳 (Machine Spirit Transfer)"
};

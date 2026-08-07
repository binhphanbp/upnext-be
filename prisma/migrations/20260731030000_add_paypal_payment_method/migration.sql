-- Checkout now offers SePay or PayPal. MOMO and STRIPE stay in the enum so
-- historical invoices that used them remain readable; they are simply no longer
-- offered as a choice in the UI.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'paypal';

-- Create price history table for Stage 2
CREATE TABLE IF NOT EXISTS product_price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    old_price DECIMAL(12,2),
    new_price DECIMAL(12,2),
    changed_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger to track price changes automatically
CREATE OR REPLACE FUNCTION track_product_price_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.price IS DISTINCT FROM NEW.price) THEN
        INSERT INTO product_price_history (product_id, old_price, new_price)
        VALUES (NEW.id, OLD.price, NEW.price);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_track_price_change ON products;
CREATE TRIGGER tr_track_price_change
AFTER UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION track_product_price_change();

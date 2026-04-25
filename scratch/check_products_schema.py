import os
# Since I can't run SQL easily, I will look for any migration that adds a column to products
migrations_dir = 'supabase/migrations'
files = os.listdir(migrations_dir)
for f in sorted(files):
    with open(os.path.join(migrations_dir, f), 'r') as file:
        content = file.read()
        if 'ALTER TABLE' in content and 'products' in content and 'embedding' in content:
            print(f"Found embedding in {f}")

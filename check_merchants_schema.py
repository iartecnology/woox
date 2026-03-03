import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Get one row to see columns
res = supabase.table("merchants").select("*").limit(1).execute()
if res.data:
    print("Columns:", list(res.data[0].keys()))
else:
    print("No data in merchants table")

# Check if BURGERKING05 exists in any column
res = supabase.table("merchants").select("*").execute()
for m in res.data:
    print(f"Merchant: {m.get('name')} | Slug: {m.get('slug')} | ID: {m.get('id')} | Code: {m.get('merchant_code')}")

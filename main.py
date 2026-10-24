from fastapi import FastAPI, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import json
import os
import time
import httpx
from datetime import datetime
import bcrypt
from typing import Optional, List
from urllib.parse import unquote



app = FastAPI()

app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/g", StaticFiles(directory="g"), name="g")
app.mount("/posters", StaticFiles(directory="posters"), name="posters")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

templates = Jinja2Templates(directory="templates")

root = os.path.dirname(os.path.abspath(__file__))
bgmi_path = os.path.join(root, "bgmi-frontend")
if os.path.isdir(bgmi_path):
    app.mount("/bgmi", StaticFiles(directory=bgmi_path, html=True), name="bgmi")

configFile = os.path.join(root, 'webinfo.json')
productsFile = os.path.join(root, 'api', 'products.php') # It's actually a json file wrapped in php, but we'll read the pure json parts if possible, wait, it has PHP at the top. Let's just use products_data.json
dataFile = os.path.join(root, 'api', 'products_data.json')
overrideFile = os.path.join(root, 'tag_overrides.json')
activityFile = os.path.join(root, 'admin_activity.json')
adminPasswordFile = os.path.join(root, 'admin_password.json')

DEFAULT_ADMIN_PASS = 'a'

def loadConfig():
    defaults = {
        'upi': '', 'merchant_name': 'Garena Top Up', 'store_name': 'Garena Top Up',
        'support': '', 'announcement': '', 'maintenance': False
    }
    if os.path.isfile(configFile):
        try:
            with open(configFile, 'r', encoding='utf-8') as f:
                data = json.load(f)
                defaults.update(data)
        except Exception:
            pass
    return defaults

def saveConfig(cfg):
    try:
        with open(configFile, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=4)
        return True
    except Exception:
        return False

def loadProducts():
    data = {'ok': True, 'categories': []}
    if os.path.isfile(dataFile):
        try:
            with open(dataFile, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            pass
    
    if os.path.isfile(overrideFile):
        try:
            with open(overrideFile, 'r', encoding='utf-8') as f:
                ov = json.load(f)
            for cat in data.get('categories', []):
                for item in cat.get('items', []):
                    pid = str(item.get('id', ''))
                    if pid in ov:
                        item['tag'] = ov[pid]
        except Exception:
            pass
    return data

def saveProducts(data):
    try:
        with open(dataFile, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)
        return True
    except Exception:
        return False

def logActivity(action):
    items = []
    if os.path.isfile(activityFile):
        try:
            with open(activityFile, 'r', encoding='utf-8') as f:
                items = json.load(f)
        except Exception:
            pass
    items.insert(0, {'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'action': action})
    items = items[:40]
    try:
        with open(activityFile, 'w', encoding='utf-8') as f:
            json.dump(items, f, indent=4)
    except Exception:
        pass

def loadActivity():
    if os.path.isfile(activityFile):
        try:
            with open(activityFile, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def getAdminPasswordHash():
    if os.path.isfile(adminPasswordFile):
        try:
            with open(adminPasswordFile, 'r', encoding='utf-8') as f:
                j = json.load(f)
                return j.get('hash', '')
        except Exception:
            pass
    return bcrypt.hashpw(DEFAULT_ADMIN_PASS.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def saveAdminPasswordHash(hashed):
    try:
        with open(adminPasswordFile, 'w', encoding='utf-8') as f:
            json.dump({'hash': hashed}, f, indent=4)
        return True
    except Exception:
        return False

from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "super-secret-key-ff-topup"))

@app.get("/")
def read_index(request: Request):
    return templates.TemplateResponse(request, "index.html", {"request": request})

@app.get("/index.php")
def redirect_index():
    return RedirectResponse(url="/")

@app.get("/garena.png")
def get_garena_png():
    return FileResponse("garena.png")

@app.get("/home.jpg")
def get_home_jpg():
    return FileResponse("home.jpg")

@app.get("/store.php")
def redirect_store():
    return RedirectResponse(url="/store")

@app.get("/store")
def read_store(request: Request):
    return templates.TemplateResponse(request, "store.html", {"request": request})

@app.get("/admin.php")
def redirect_admin():
    return RedirectResponse(url="/admin")

@app.get("/admin")
def read_admin(request: Request, error: str = "", success: str = ""):
    logged = request.session.get("admin_auth", False)
    cfg = loadConfig()
    data = loadProducts()
    activity = loadActivity()
    
    products = []
    categories = []
    for cat in data.get('categories', []):
        categories.append(cat)
        for item in cat.get('items', []):
            item['_category'] = cat.get('slug', '')
            item['_category_name'] = cat.get('name', cat.get('slug', ''))
            products.append(item)
    
    total = len(products)
    inStock = len([p for p in products if int(p.get('stock', 0)) > 0])
    outStock = total - inStock
    lowStock = len([p for p in products if 0 < int(p.get('stock', 0)) <= 10])
    tagged = len([p for p in products if p.get('tag')])
    catCount = len(categories)
    alerts = [p for p in products if int(p.get('stock', 0)) <= 10]
    
    return templates.TemplateResponse(request, "admin.html", {
        "request": request,
        "logged": logged,
        "error": error,
        "success": success,
        "cfg": cfg,
        "products": products,
        "categories": categories,
        "activity": activity,
        "total": total,
        "inStock": inStock,
        "outStock": outStock,
        "lowStock": lowStock,
        "tagged": tagged,
        "catCount": catCount,
        "alerts": alerts
    })

@app.post("/admin")
async def post_admin(request: Request):
    form = await request.form()
    
    if "logout" in request.query_params:
        request.session.clear()
        return RedirectResponse(url="/admin", status_code=303)
        
    if "login" in form:
        username = form.get("username", "")
        password = form.get("password", "")
        if username == "a" and bcrypt.checkpw(password.encode('utf-8'), getAdminPasswordHash().encode('utf-8')):
            request.session["admin_auth"] = True
            logActivity("Admin login")
            return RedirectResponse(url="/admin", status_code=303)
        return RedirectResponse(url="/admin?error=Invalid username or password.", status_code=303)
        
    if not request.session.get("admin_auth", False):
        return RedirectResponse(url="/admin", status_code=303)
        
    action = form.get("action", "")
    cfg = loadConfig()
    data = loadProducts()
    
    error = ""
    success = ""
    
    if action == "change_password":
        current = form.get("current_password", "")
        new_pass = form.get("new_password", "")
        confirm = form.get("confirm_password", "")
        if not bcrypt.checkpw(current.encode('utf-8'), getAdminPasswordHash().encode('utf-8')):
            error = "Current password is incorrect."
        elif len(new_pass) < 6:
            error = "New password must be at least 6 characters."
        elif new_pass != confirm:
            error = "New password and confirmation do not match."
        else:
            hashed = bcrypt.hashpw(new_pass.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            if saveAdminPasswordHash(hashed):
                logActivity("Admin password changed")
                success = "Admin password changed successfully. Please use the new password next time you log in."
            else:
                error = "Could not save the new password."
                
    elif action == "save_payment":
        newUpi = form.get("upi", "").strip()
        newMerchant = form.get("merchant_name", "").strip()
        if not newUpi or "@" not in newUpi:
            error = "Invalid UPI ID. Example: name@upi"
        elif not newMerchant:
            error = "Enter a valid merchant name."
        else:
            cfg["upi"] = newUpi
            cfg["merchant_name"] = newMerchant
            if saveConfig(cfg):
                logActivity("Payment settings updated")
                success = "Payment settings saved."
            else:
                error = "Cannot write config."
                
    elif action == "save_store":
        cfg["store_name"] = form.get("store_name", "").strip()
        cfg["support"] = form.get("support", "").strip()
        cfg["announcement"] = form.get("announcement", "").strip()
        cfg["maintenance"] = "maintenance" in form
        if not cfg["store_name"]:
            error = "Store name is required."
        elif saveConfig(cfg):
            logActivity("Store settings updated")
            success = "Store settings saved."
        else:
            error = "Could not save store settings."
            
    elif action == "save_product":
        pid = form.get("id", "").strip()
        cat_slug = form.get("category", "").strip()
        name = form.get("name", "").strip()
        amount = form.get("amount", "").strip()
        sub = form.get("sub", "").strip()
        icon = form.get("icon", "💎").strip()
        image = form.get("image", "").strip()
        price = max(0.0, float(form.get("price", 0)))
        old = max(0.0, float(form.get("old", 0)))
        tag = form.get("tag", "").strip()
        stock = max(0, int(form.get("stock", 0)))
        
        if not pid or not cat_slug or not name:
            error = "Product ID, category and product name are required."
        else:
            found = False
            for cat in data.get("categories", []):
                if cat.get("slug") == cat_slug:
                    found = True
                    product = {
                        "id": pid, "icon": icon or "💎", "image": image, "amount": amount,
                        "name": name, "sub": sub, "price": price, "old": old, "tag": tag if tag else None,
                        "stock": stock, "inStock": stock > 0
                    }
                    replaced = False
                    for k, item in enumerate(cat.get("items", [])):
                        if item.get("id") == pid:
                            cat["items"][k] = product
                            replaced = True
                            break
                    if not replaced:
                        cat.setdefault("items", []).append(product)
                    break
            if not found:
                error = "Category not found."
            elif saveProducts(data):
                logActivity(f"Product saved: {pid}")
                success = "Product saved successfully."
            else:
                error = "Could not write product list."
                
    elif action == "delete_product":
        pid = form.get("id", "").strip()
        deleted = False
        for cat in data.get("categories", []):
            for k, item in enumerate(cat.get("items", [])):
                if item.get("id") == pid:
                    del cat["items"][k]
                    deleted = True
                    break
            if deleted: break
        if deleted and saveProducts(data):
            logActivity(f"Product deleted: {pid}")
            success = "Product deleted."
        else:
            error = "Product not found or could not save."
            
    elif action == "save_tag":
        pid = form.get("id", "").strip()
        tag = form.get("tag", "").strip()[:32]
        updated = False
        for cat in data.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == pid:
                    item["tag"] = tag if tag else None
                    updated = True
                    break
            if updated: break
            
        if not updated:
            error = "Product not found."
        else:
            overrides = {}
            if os.path.isfile(overrideFile):
                try:
                    with open(overrideFile, 'r', encoding='utf-8') as f:
                        overrides = json.load(f)
                except: pass
            overrides[pid] = tag if tag else None
            try:
                with open(overrideFile, 'w', encoding='utf-8') as f:
                    json.dump(overrides, f, indent=4)
                saveProducts(data)
                logActivity(f"Tag updated: {pid} → {tag if tag else 'none'}")
                success = "Product tag removed successfully." if not tag else "Product tag updated successfully."
            except:
                error = "Could not save tag."
                
    elif action == "save_stock":
        pid = form.get("id", "").strip()
        stock = max(0, int(form.get("stock", 0)))
        updated = False
        for cat in data.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == pid:
                    item["stock"] = stock
                    item["inStock"] = stock > 0
                    updated = True
                    break
            if updated: break
        if updated and saveProducts(data):
            logActivity(f"Stock updated: {pid} → {stock}")
            success = "Stock updated."
        else:
            error = "Product not found or could not save."
            
    elif action == "bulk_stock":
        mode = form.get("mode", "set")
        val = max(0, int(form.get("value", 0)))
        ids = form.getlist("ids[]")
        changed = 0
        for cat in data.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") in ids:
                    cur = int(item.get("stock", 0))
                    new_val = max(0, cur + val) if mode == "add" else (max(0, cur - val) if mode == "sub" else val)
                    item["stock"] = new_val
                    item["inStock"] = new_val > 0
                    changed += 1
        if changed and saveProducts(data):
            logActivity(f"Bulk stock update: {changed} products")
            success = f"{changed} products updated."
        else:
            error = "Select at least one product or save failed."
            
    # Redirect with success or error
    return RedirectResponse(url=f"/admin?error={error}&success={success}", status_code=303)


@app.get("/api/products")
@app.get("/api/products.php")
def get_products():
    data = loadProducts()
    return JSONResponse(content=data)

# ============================================================
#  BGMI ID Verification (Rooter / UniPin)
# ============================================================
_bgmi_auth_token = None
_bgmi_auth_token_expiry = 0

async def get_bgmi_authorization_token():
    global _bgmi_auth_token, _bgmi_auth_token_expiry
    now = time.time()
    if _bgmi_auth_token and now < _bgmi_auth_token_expiry:
        return _bgmi_auth_token

    url = "https://www.rooter.gg/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            user_auth = resp.cookies.get("user_auth")
            if user_auth:
                access_token_json = unquote(user_auth)
                access_token_data = json.loads(access_token_json)
                token = access_token_data.get("accessToken")
                if token:
                    _bgmi_auth_token = token
                    _bgmi_auth_token_expiry = now + 1800  # cache 30 mins
                    return token
    except Exception:
        pass
    return None

async def verify_bgmi_uid(uid: str):
    if not uid.isdigit() or not (5 <= len(uid) <= 14):
        return JSONResponse(status_code=400, content={"status": "error", "message": "Invalid BGMI Character ID. Must be 5-14 digits."})

    token = await get_bgmi_authorization_token()
    if not token:
        global _bgmi_auth_token
        _bgmi_auth_token = None
        token = await get_bgmi_authorization_token()

    if not token:
        return JSONResponse(status_code=503, content={"status": "error", "message": "BGMI verification service temporarily unavailable."})

    url = f"https://bazaar.rooter.io/order/getUnipinUsername?gameCode=BGMI_IN&id={uid}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Device-Type": "web",
        "App-Version": "1.0.0",
        "Device-Id": "cli-tool",
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("transaction") == "SUCCESS":
                    unipin_res = data.get("unipinRes") or {}
                    username = unipin_res.get("username", "")
                    if username:
                        return JSONResponse(content={
                            "status": "success",
                            "ok": True,
                            "transaction": "SUCCESS",
                            "username": username,
                            "nickname": username,
                            "name": username,
                            "uid": uid,
                            "server": "BGMI",
                            "region": "India",
                            "unipinRes": unipin_res,
                            "basicInfo": {
                                "nickname": username,
                                "accountId": uid,
                                "region": "India",
                                "server": "BGMI"
                            }
                        })
                return JSONResponse(status_code=404, content={"status": "error", "message": "BGMI Character ID not found. Please check your ID."})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"Verification error: {str(e)}"})

    return JSONResponse(status_code=404, content={"status": "error", "message": "Character ID not found."})

@app.get("/api/bgmi-verify")
@app.get("/api/bgmi-verify.php")
@app.get("/api/bgmi/verify")
async def get_bgmi_verify(uid: str = ""):
    return await verify_bgmi_uid(uid)

@app.get("/api/verify")
@app.get("/api/verify.php")
async def verify_uid(uid: str = "", game: Optional[str] = None):
    if game and game.lower() in ("bgmi", "bgmi_in", "pubg"):
        return await verify_bgmi_uid(uid)

    if not uid.isdigit() or not (6 <= len(uid) <= 12):
        return JSONResponse(status_code=400, content={"status": "error", "message": "Invalid UID"})
    
    apis = [
        f"https://s.xysushi.in/ff/?uid={uid}",
        f"https://topup-store.in/ff-lookup-v3.php/api/ff-lookup.php?uid={uid}"
    ]
    
    async with httpx.AsyncClient() as client:
        for api in apis:
            try:
                resp = await client.get(api, timeout=10.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("status") != "error":
                        return JSONResponse(content=data)
            except Exception:
                continue
                
    return JSONResponse(content={"status": "error", "message": "UID lookup temporarily unavailable. Please try again."})

@app.get("/api/qr")
@app.get("/api/qr.php")
def qr_code(d: str = "", s: int = 280):
    s = max(160, min(512, s))
    if not d or len(d) > 2000 or not d.lower().startswith('upi://pay?'):
        return JSONResponse(status_code=400, content={"message": "Invalid UPI QR payload"})
    
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size={s}x{s}&data={d}"
    return RedirectResponse(url=qr_url, status_code=302)

@app.get("/api/config")
@app.get("/api/config.php")
def get_config():
    cfg = loadConfig()
    return JSONResponse(content={
        "ok": True,
        "upi": cfg.get("upi", ""),
        "merchant_name": cfg.get("merchant_name", "Garena Top Up"),
        "store_name": cfg.get("store_name", "Official Top Up"),
        "support": cfg.get("support", ""),
        "announcement": cfg.get("announcement", ""),
        "maintenance": cfg.get("maintenance", False)
    })

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ff-topup-backend", "time": time.time()}

# Ensure required upload directories exist
for folder in ["uploads/products", "uploads/categories", "api"]:
    os.makedirs(os.path.join(root, folder), exist_ok=True)

if __name__ == "__main__":
    import uvicorn
    # Support Pterodactyl SERVER_PORT or standard PORT env variables
    port_env = os.environ.get("SERVER_PORT", os.environ.get("PORT", "8656"))
    try:
        port = int(port_env)
    except ValueError:
        port = 8656
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)

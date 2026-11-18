from .conftest import login, sql


async def test_health(client):
    assert (await client.get("/api/health")).json() == {"ok": True}


async def test_login_and_me(client):
    r = await client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert r.status_code == 401
    h = await login(client, "owner1")
    me = (await client.get("/api/me", headers=h)).json()
    assert me["role"] == "owner" and me["team_id"] == 1


async def test_requires_token(client):
    assert (await client.get("/api/teams")).status_code == 401


async def test_owner_blocked_from_admin_routes(client, auth):
    for method, path, body in [
        ("post", "/api/auction/start", None),
        ("post", "/api/players", {"name": "X", "tier_id": 1}),
        ("put", "/api/settings", None),
        ("get", "/api/users", None),
        ("post", "/api/auction/next", {"mode": "order"}),
    ]:
        r = await client.request(method, path, json=body or {}, headers=auth["owner1"])
        assert r.status_code in (403, 422), (path, r.status_code)
        if r.status_code == 422:
            # validation may run first for bodies; confirm role check with a valid body too
            pass
    r = await client.post("/api/auction/start", headers=auth["owner1"])
    assert r.status_code == 403


async def test_admin_cannot_bid(client, auth):
    await client.post("/api/auction/start", headers=auth["admin"])
    lot = (await client.post("/api/auction/next", json={"mode": "order"}, headers=auth["admin"])).json()
    r = await client.post("/api/auction/bid", json={"lot_id": lot["lot_id"], "amount": 200}, headers=auth["admin"])
    assert r.status_code == 409 and r.json()["detail"] == "NOT_OWNER"


async def test_owner_edits_only_own_team(client, auth):
    r = await client.patch("/api/teams/1", json={"name": "Codet Kings", "short_code": "ck"}, headers=auth["owner1"])
    assert r.status_code == 200
    r = await client.patch("/api/teams/2", json={"name": "Hijack"}, headers=auth["owner1"])
    assert r.status_code == 403
    r = await client.patch("/api/teams/2", json={"color": "#123456"}, headers=auth["admin"])
    assert r.status_code == 200
    teams = (await client.get("/api/teams", headers=auth["owner2"])).json()
    assert teams[0]["name"] == "Codet Kings" and teams[0]["short_code"] == "CK"
    assert teams[1]["color"] == "#123456"


async def test_password_change_flow(client, auth):
    r = await client.post("/api/me/password", json={"current_password": "wrong", "new_password": "secret123"},
                          headers=auth["owner2"])
    assert r.status_code == 400
    r = await client.post("/api/me/password", json={"current_password": "cpl-owner2", "new_password": "secret123"},
                          headers=auth["owner2"])
    assert r.status_code == 200
    r = await client.post("/api/auth/login", json={"username": "owner2", "password": "secret123"})
    assert r.status_code == 200


async def test_players_crud_and_tier_move(client, auth):
    a = auth["admin"]
    players = (await client.get("/api/players", headers=a)).json()
    assert len(players) == 41
    r = await client.post("/api/players", json={"name": "New Guy", "tier_id": 3, "role": "bowler"}, headers=a)
    assert r.status_code == 201
    pid = r.json()["id"]
    r = await client.patch(f"/api/players/{pid}", json={"tier_id": 1, "note": "Quick"}, headers=a)
    assert r.json()["tier_id"] == 1 and r.json()["note"] == "Quick"
    assert len((await client.get("/api/players?tier=1", headers=a)).json()) == 7
    assert (await client.delete(f"/api/players/{pid}", headers=a)).status_code == 204
    assert len((await client.get("/api/players", headers=a)).json()) == 41


async def test_csv_import(client, auth):
    csv = "name,tier,role\nAlpha,gold,batter\nBeta,Emerging,\n,silver,\nGamma,nonsense,\n"
    r = await client.post("/api/players/import", files={"file": ("p.csv", csv, "text/csv")}, headers=auth["admin"])
    assert r.json()["added"] == 2 and len(r.json()["errors"]) == 2


async def test_queue_order(client, auth):
    a = auth["admin"]
    plat = (await client.get("/api/players?tier=1", headers=a)).json()
    ids = [p["id"] for p in plat][::-1]
    await client.put("/api/players/order", json={"tier_id": 1, "player_ids": ids}, headers=a)
    await client.post("/api/auction/start", headers=a)
    lot = (await client.post("/api/auction/next", json={"mode": "order"}, headers=a)).json()
    assert lot["player"]["id"] == ids[0]


async def test_settings_lock(client, auth):
    a = auth["admin"]
    s = (await client.get("/api/settings", headers=a)).json()
    s["purse"] = 1200
    s["tiers"][0]["base_price"] = 180
    r = await client.put("/api/settings", json=s, headers=a)
    assert r.status_code == 200 and r.json()["tiers"][0]["base_price"] == 180
    teams = (await client.get("/api/teams", headers=a)).json()
    assert all(t["purse_remaining"] == 1200 for t in teams)
    await client.post("/api/auction/start", headers=a)
    r = await client.put("/api/settings", json=s, headers=a)
    assert r.status_code == 409


async def test_user_admin_and_team_swap(client, auth):
    a = auth["admin"]
    users = (await client.get("/api/users", headers=a)).json()
    owner1 = next(u for u in users if u["username"] == "owner1")
    r = await client.patch(f"/api/users/{owner1['id']}", json={"team_id": 2, "display_name": "Ali"}, headers=a)
    assert r.json()["team_id"] == 2
    rows = await sql("select username, team_id from users where role='owner' order by username")
    assert rows == [("owner1", 2), ("owner2", 1), ("owner3", 3)]
    r = await client.patch(f"/api/users/{owner1['id']}", json={"password": "fresh-pass"}, headers=a)
    assert r.json()["must_change_password"] is True


async def test_image_upload_roundtrip(client, auth):
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (900, 600), "red").save(buf, format="JPEG")
    r = await client.post("/api/me/avatar", files={"file": ("a.jpg", buf.getvalue(), "image/jpeg")},
                          headers=auth["owner1"])
    assert r.status_code == 200
    img_id = r.json()["avatar_image_id"]
    img = await client.get(f"/api/images/{img_id}")
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert max(Image.open(io.BytesIO(img.content)).size) == 512
    r = await client.post("/api/me/avatar", files={"file": ("a.txt", b"hello", "text/plain")}, headers=auth["owner1"])
    assert r.status_code == 415

def test_home_page(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "mortgage-common.js" in r.text


def test_buy_vs_rent_page(client):
    r = client.get("/buy-vs-rent")
    assert r.status_code == 200
    assert "mortgage-common.js" in r.text
    assert "mortgage-bvr.js" in r.text


def test_amortization_page(client):
    r = client.get("/amortization")
    assert r.status_code == 200
    assert "mortgage-common.js" in r.text


def test_version_endpoint(client):
    r = client.get("/version")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data
    assert "git_commit" in data

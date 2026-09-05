"""Project CRUD + archive, and cross-user permission checks."""

import pytest
from fastapi.testclient import TestClient

import main

pytestmark = pytest.mark.usefixtures("temp_db")


@pytest.fixture()
def client():
    return TestClient(main.app)


def test_create_list_get_project(client, user_and_token):
    _, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/projects", json={"name": "Market Research", "description": "Q1"}, headers=headers)
    assert created.status_code == 200
    project_id = created.json()["id"]
    assert created.json()["status"] == "active"

    listed = client.get("/projects", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["session_count"] == 0

    got = client.get(f"/projects/{project_id}", headers=headers)
    assert got.status_code == 200
    assert got.json()["name"] == "Market Research"


def test_create_project_rejects_empty_name(client, user_and_token):
    _, token = user_and_token
    resp = client.post("/projects", json={"name": "   "}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


def test_rename_and_archive_project(client, user_and_token):
    _, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}
    project_id = client.post("/projects", json={"name": "Old Name"}, headers=headers).json()["id"]

    renamed = client.patch(f"/projects/{project_id}", json={"name": "New Name"}, headers=headers)
    assert renamed.json()["name"] == "New Name"

    archived = client.patch(f"/projects/{project_id}", json={"status": "archived"}, headers=headers)
    assert archived.json()["status"] == "archived"

    bad_status = client.patch(f"/projects/{project_id}", json={"status": "deleted"}, headers=headers)
    assert bad_status.status_code == 400


def test_delete_project(client, user_and_token):
    _, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}
    project_id = client.post("/projects", json={"name": "Temp"}, headers=headers).json()["id"]

    deleted = client.delete(f"/projects/{project_id}", headers=headers)
    assert deleted.status_code == 200
    assert client.get(f"/projects/{project_id}", headers=headers).status_code == 404


def test_project_runs_lists_sessions_in_project(client, user_and_token, temp_db):
    user, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}
    project_id = client.post("/projects", json={"name": "P"}, headers=headers).json()["id"]
    temp_db.save_research_run(user["id"], "r1", "q", "done", "a", [], [], {}, [])
    temp_db.set_research_run_project(user["id"], "r1", project_id)

    runs = client.get(f"/projects/{project_id}/runs", headers=headers)
    assert runs.status_code == 200
    assert [r["id"] for r in runs.json()] == ["r1"]


def test_cannot_access_another_users_project(client, user_and_token, other_user_and_token):
    _, token = user_and_token
    _, other_token = other_user_and_token
    project_id = client.post("/projects", json={"name": "Mine"}, headers={"Authorization": f"Bearer {token}"}).json()["id"]

    other_headers = {"Authorization": f"Bearer {other_token}"}
    assert client.get(f"/projects/{project_id}", headers=other_headers).status_code == 404
    assert client.patch(f"/projects/{project_id}", json={"name": "Hijacked"}, headers=other_headers).status_code == 404
    assert client.delete(f"/projects/{project_id}", headers=other_headers).status_code == 404

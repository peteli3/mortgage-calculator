from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .internal.common import templates, VERSION, GIT_COMMIT, RESTART_TIME
from .routers.mortgage import router as mortgage_router

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.include_router(mortgage_router)


@app.get("/version")
def get_version():
    return {
        "version": VERSION,
        "git_commit": GIT_COMMIT,
    }


def _amortization_response(request: Request, initial_tab: str | None = None):
    return templates.TemplateResponse(
        request=request,
        name="amortization.html",
        context={
            "request": request,
            "version": VERSION,
            "git_commit": GIT_COMMIT,
            "restart_time": RESTART_TIME,
            "initial_tab": initial_tab or "",
        },
    )


@app.get("/amortization", response_class=HTMLResponse)
def get_amortization_page(request: Request):
    return _amortization_response(request)


@app.get("/amortization/graph", response_class=HTMLResponse)
def get_amortization_graph_page(request: Request):
    return _amortization_response(request, initial_tab="graph")


@app.get("/amortization/schedule", response_class=HTMLResponse)
def get_amortization_schedule_page(request: Request):
    return _amortization_response(request, initial_tab="schedule")


@app.get("/buy-vs-rent", response_class=HTMLResponse)
def get_buy_vs_rent_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="buy_vs_rent.html",
        context={
            "request": request,
            "version": VERSION,
            "git_commit": GIT_COMMIT,
            "restart_time": RESTART_TIME,
        },
    )


@app.get("/", response_class=HTMLResponse)
def get_home_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "request": request,
            "version": VERSION,
            "git_commit": GIT_COMMIT,
            "restart_time": RESTART_TIME,
        },
    )

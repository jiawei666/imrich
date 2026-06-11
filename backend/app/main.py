from fastapi import FastAPI

app = FastAPI(title="i'mRich 选股器")


@app.get("/health")
def health():
    return {"status": "ok"}

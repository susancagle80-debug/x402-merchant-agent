from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

@app.get("/", response_class=HTMLResponse)
async def homepage():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Merchant Agent</title>
        <meta name="base:app_id" content="6a8373fb01463168d7e651ba" />
    </head>
    <body>
        <h1>Merchant Agent</h1>
        <p>x402 Payment Processing & Agent Intelligence Service</p>
    </body>
    </html>
    """

# Add your other routes below
# @app.post("/audit")
# async def audit_endpoint(request: AuditRequest):
#     ...

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

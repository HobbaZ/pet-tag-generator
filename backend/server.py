"""Local order API. Run from this directory with uvicorn server:app."""
from pathlib import Path
from typing import Literal
from uuid import uuid4
from datetime import datetime, timezone
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from generator import generate

ROOT = Path(__file__).resolve().parent
ORDERS = ROOT / 'orders'
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=[
    'http://localhost:3000','http://localhost:5173',
    'http://127.0.0.1:3000','http://127.0.0.1:5173',
], allow_methods=['POST','GET'], allow_headers=['Content-Type'])

class OrderRequest(BaseModel):
    modelId: Literal['pet-tag']
    petName: str = Field(min_length=1,max_length=24)
    phoneNumber: str = Field(min_length=1,max_length=24)
    colour: Literal['Silk Copper','Matte Black','Matte Red','Matte White','Glow Green']

    @field_validator('petName','phoneNumber')
    @classmethod
    def clean_text(cls,value):
        value = value.strip()
        if not value or any(ord(c)<32 for c in value):
            raise ValueError('Enter visible text without control characters')
        return value

@app.post('/api/orders',status_code=201)
def create_order(request: OrderRequest):
    order_id = uuid4().hex
    directory = ORDERS/order_id
    directory.mkdir(parents=True)
    output = directory/'pet-tag.stl'
    try:
        fit = generate(request.petName,request.phoneNumber,output)
        metadata = dict(id=order_id,created_at=datetime.now(timezone.utc).isoformat(),
            status='awaiting_manual_review',**request.model_dump(),**fit)
        (directory/'order.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    except ValueError as error:
        output.unlink(missing_ok=True)
        directory.rmdir()
        raise HTTPException(status_code=422,detail=str(error)) from error
    except Exception:
        output.unlink(missing_ok=True)
        (directory/'order.json').unlink(missing_ok=True)
        directory.rmdir()
        raise
    return dict(id=order_id,download_url=f'/api/orders/{order_id}/stl',**fit)

@app.get('/api/orders/{order_id}/stl')
def download_stl(order_id: str):
    if len(order_id)!=32 or any(c not in '0123456789abcdef' for c in order_id):
        raise HTTPException(status_code=404,detail='Order not found')
    path = ORDERS/order_id/'pet-tag.stl'
    if not path.is_file(): raise HTTPException(status_code=404,detail='Order not found')
    return FileResponse(path,media_type='model/stl',filename='pet-tag.stl')

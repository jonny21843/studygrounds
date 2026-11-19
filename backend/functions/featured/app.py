from legal_guard import require_legal_acceptance
import json,os,re
from datetime import datetime,timezone
import boto3
from boto3.dynamodb.conditions import Key
d=boto3.resource("dynamodb")
prefs=d.Table(os.environ["PREFERENCES_TABLE"])
notes=d.Table(os.environ["NOTES_TABLE"])
admins={x.strip().lower() for x in os.environ.get("ADMIN_EMAILS","").split(",") if x.strip()}
pattern=re.compile(r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
global_key={"pk":"GLOBAL","sk":"FEATURED_NOTE"}
def result(status,body):
    return {"statusCode":status,"headers":{"Content-Type":"application/json"},"body":json.dumps(body)}
def claims(e):
    return (((e.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims") or {}
def admin(e):
    c=claims(e)
    email=str(c.get("email") or "").strip().lower()
    user=str(c.get("username") or c.get("cognito:username") or "").strip().lower()
    return email if email in admins else user if user in admins else None
def featured():
    return prefs.get_item(Key=global_key,ConsistentRead=True).get("Item") or {}
def available(note_id):
    if not isinstance(note_id,str) or not pattern.fullmatch(note_id):return None
    found=notes.query(IndexName="NoteIdIndex",KeyConditionExpression=Key("noteId").eq(note_id),Limit=1)
    locator=next(iter(found.get("Items") or []),None)
    if not locator or not locator.get("userId"):return None
    n=notes.get_item(Key={"userId":locator["userId"],"noteId":note_id},ConsistentRead=True).get("Item")
    if not n or n.get("visibility")!="public" or n.get("moderationHold"):return None
    if not any(f.get("malwareScanStatus") in (None,"NO_THREATS_FOUND") for f in n.get("files") or []):return None
    return n
def lambda_handler(event,context):
    legal_block = require_legal_acceptance(event)
    if legal_block is not None:
        return legal_block
    path=(event.get("rawPath") or "").rstrip("/")
    method=((event.get("requestContext") or {}).get("http") or {}).get("method","").upper()
    if path=="/api/featured-note" and method=="GET":
        n=available(featured().get("noteId"))
        return result(200,{"note":{k:n.get(k) for k in ("noteId","title","description","publicAuthor")} if n else None})
    if path=="/api/admin/featured-note" and method in ("PUT","DELETE"):
        who=admin(event)
        if not who:return result(403,{"error":"Admin access required."})
        if method=="DELETE":
            prefs.delete_item(Key=global_key)
            return result(200,{"note":None})
        try: body=json.loads(event.get("body") or "{}")
        except (ValueError,TypeError):return result(400,{"error":"Invalid JSON."})
        note_id=body.get("noteId")
        if not available(note_id):return result(400,{"error":"Note must be public, available, and not moderated."})
        prefs.put_item(Item={**global_key,"noteId":note_id,"featuredAt":datetime.now(timezone.utc).isoformat(),"featuredBy":who})
        return result(200,{"noteId":note_id})
    if path=="/api/featured-note/dismissal" and method in ("GET","PUT","DELETE"):
        sub=claims(event).get("sub")
        if not sub:return result(401,{"error":"Sign in required."})
        note_id=featured().get("noteId")
        if not available(note_id):
            return result(200,{"noteId":None,"dismissed":False}) if method=="GET" else result(404,{"error":"No featured note."})
        key={"pk":"USER#"+sub,"sk":"FEATURED_NOTE#"+note_id}
        if method=="GET":return result(200,{"noteId":note_id,"dismissed":"Item" in prefs.get_item(Key=key,ConsistentRead=True)})
        if method=="PUT":prefs.put_item(Item={**key,"dismissedAt":datetime.now(timezone.utc).isoformat()})
        else:prefs.delete_item(Key=key)
        return result(200,{"noteId":note_id,"dismissed":method=="PUT"})
    return result(404,{"error":"Not found."})

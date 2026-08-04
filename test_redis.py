import asyncio
import redis.asyncio as redis

async def main():
    r = redis.Redis(host='localhost', port=6379, decode_responses=True)
    keys = await r.keys("*")
    print(f"Total keys: {len(keys)}")
    for key in keys:
        if "queue" in key or "status" in key or "proc" in key:
            type_ = await r.type(key)
            if type_ == "list":
                len_ = await r.llen(key)
                print(f"{key}: list of length {len_}")
            elif type_ == "string":
                val = await r.get(key)
                print(f"{key}: string '{val}'")

if __name__ == '__main__':
    asyncio.run(main())

# JWT Testing

JWT Payload
```json
{
  "dir": "users/john_doe/documents",
  "quota": "100MB",
  "expires": "2026-12-31T23:59:59Z"
}
```

Started with
```bash
go run main.go -dir /Users/thorsten/tmp/ -jwt Ood0aicaip1IepohngeeQu7ieghub2theeleiV9gohr8LejiaXah8eetho8eF9daethieJengi6Voo9oeRootohphoh2eiroh1lei7tahGha2Wei7aphoav0ohghiuQueeYau7fahdeet8aix5Zu5iet4leyoh1shoowiutohwa1phizier8aph6eLae9shei7mai1oojiengeeTh5EizaeTing6aaRah7ep1ihip2iez0no2no5Eequ1zeew0Lu
```

Tested with
```bash
curl -H "Authorization: Bearer $JWT" http://localhost:3000/api/files -v
* Host localhost:3000 was resolved.
* IPv6: ::1
* IPv4: 127.0.0.1
*   Trying [::1]:3000...
* connect to ::1 port 3000 from ::1 port 57496 failed: Connection refused
*   Trying 127.0.0.1:3000...
* Connected to localhost (127.0.0.1) port 3000
> GET /api/files HTTP/1.1
> Host: localhost:3000
> User-Agent: curl/8.7.1
> Accept: */*
> Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaXIiOiJ1c2Vycy9qb2huX2RvZS9kb2N1bWVudHMiLCJxdW90YSI6IjEwME1CIiwiZXhwaXJlcyI6IjIwMjYtMTItMzFUMjM6NTk6NTlaIn0.2HRVRhOXp-QnP_gjxq4ViYAFMufgwCLg2o29J9MSFac
> 
* Request completely sent off
< HTTP/1.1 500 Internal Server Error
< Content-Type: text/plain; charset=utf-8
< X-Content-Type-Options: nosniff
< Date: Fri, 25 Jul 2025 14:16:31 GMT
< Content-Length: 103
< 
failed to read directory: open /Users/thorsten/tmp/users/john_doe/documents: no such file or directory
* Connection #0 to host localhost left intact
```

## Problem
failed to read directory: open /Users/thorsten/tmp/users/john_doe/documents: no such file or directory
HTTP Status 500

## Expecting 
HTTP Status 404
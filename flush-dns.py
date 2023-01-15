import json
import argparse
from tencentcloud.common import credential
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile
from tencentcloud.common.exception.tencent_cloud_sdk_exception import (
    TencentCloudSDKException,
)
from tencentcloud.cdn.v20180606 import cdn_client, models

# 传入参数
parser = argparse.ArgumentParser(description='-i <secretId> -k <secretKey>')
parser.add_argument('-i', '--secretid', type=str, required=True, help='secretId')
parser.add_argument('-k', '--secretkey', type=str, required=True, help='secretKey')
args = parser.parse_args()

try:
    cred = credential.Credential(args.secretid,args.secretkey)
    httpProfile = HttpProfile()
    httpProfile.endpoint = "cdn.tencentcloudapi.com"

    clientProfile = ClientProfile()
    clientProfile.httpProfile = httpProfile
    client = cdn_client.CdnClient(cred, "", clientProfile)

    req = models.PurgePathCacheRequest()
    params = {"Paths": ["https://koobai.com/", "https://www.koobai.com/" ], "FlushType": "flush"}
    req.from_json_string(json.dumps(params))

    resp = client.PurgePathCache(req)
    print(resp.to_json_string())

except TencentCloudSDKException as err:
    print(err)

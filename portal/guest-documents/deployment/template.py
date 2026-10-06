"""Add the staff document runtime to the existing staging task and load balancer."""
from copy import deepcopy
import re


def prepare(current, images):
    assert set(images) == {'api', 'guest'}
    for image in images.values():
        assert re.fullmatch(r'059393269249\.dkr\.ecr\.us-east-1\.amazonaws\.com/growthcast-portal-staging-backup@sha256:[a-f0-9]{64}', image)
    template = deepcopy(current)
    resources = template['Resources']
    task = resources['Task']['Properties']
    assert task['Family'] == 'growthcast-portal-staging-api'
    assert {c['Name'] for c in task['ContainerDefinitions']} == {'api', 'mail'}
    api = next(c for c in task['ContainerDefinitions'] if c['Name'] == 'api')
    assert task['Cpu'] == '512' and task['Memory'] == '1024'
    api['Image'] = images['api']
    logs = deepcopy(api['LogConfiguration'])
    logs['Options']['awslogs-stream-prefix'] = 'staging-documents'
    task['ContainerDefinitions'].append({
        'Name': 'guest', 'Image': images['guest'], 'Essential': True,
        'User': '1000', 'ReadonlyRootFilesystem': True,
        'Environment': [{'Name': 'GC_GUEST_SHARED_RUNTIME', 'Value': '1'}],
        'DependsOn': [{'ContainerName': 'api', 'Condition': 'HEALTHY'}],
        'PortMappings': [{'ContainerPort': 3002, 'Protocol': 'tcp'}],
        'MountPoints': [{'SourceVolume': name, 'ContainerPath': '/run/'+name, 'ReadOnly': True}
                        for name in ['connections', 'origin', 'storage']],
        'LogConfiguration': logs,
        'HealthCheck': {'Command': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],
                        'Interval': 15, 'Timeout': 5, 'Retries': 3, 'StartPeriod': 60},
        'LinuxParameters': {'Capabilities': {'Drop': ['ALL']}}
    })
    target = deepcopy(resources['Target'])
    target['Properties'].update(Port=3002, HealthCheckPath='/health', Matcher={'HttpCode': '200'})
    resources['GuestTarget'] = target
    resources['GuestIngress'] = deepcopy(resources['ApiIngress'])
    resources['GuestIngress']['Properties'].update(FromPort=3002, ToPort=3002)
    resources['LoadBalancerSecurityGroup']['Properties']['SecurityGroupEgress'].append({
        'IpProtocol': 'tcp', 'FromPort': 3002, 'ToPort': 3002,
        'DestinationSecurityGroupId': {'Ref': 'ApiSecurityGroup'}})
    rule = resources['ApiRoute']['Properties']
    assert rule['Priority'] == 1
    assert rule['Conditions'] == [
        {'Field': 'host-header', 'Values': ['api.clients.staging.growthcast.app']},
        {'Field': 'path-pattern', 'Values': ['/api/*']}]
    rule['Priority'] = 10
    resources['GuestRoute'] = {
        'Type': 'AWS::ElasticLoadBalancingV2::ListenerRule', 'DependsOn': 'ApiRoute',
        'Properties': {'ListenerArn': deepcopy(rule['ListenerArn']), 'Priority': 2,
                       'Conditions': [deepcopy(rule['Conditions'][0]),
                                      {'Field': 'path-pattern', 'Values': ['/api/guest/staff/*']}],
                       'Actions': [{'Type': 'forward', 'TargetGroupArn': {'Ref': 'GuestTarget'}}]}}
    service = resources['Service']
    dependencies = service.get('DependsOn', [])
    if isinstance(dependencies, str): dependencies = [dependencies]
    service['DependsOn'] = list(dict.fromkeys(dependencies+['GuestRoute']))
    service['Properties']['LoadBalancers'].append({
        'ContainerName': 'guest', 'ContainerPort': 3002, 'TargetGroupArn': {'Ref': 'GuestTarget'}})
    template.setdefault('Outputs', {})['GuestTargetGroupArn'] = {'Value': {'Ref': 'GuestTarget'}}
    # No new compute service, VPC, database, credentials, mail transport or scanner.
    assert set(resources)-set(current['Resources']) == {'GuestTarget', 'GuestIngress', 'GuestRoute'}
    for name in ['Cpu', 'Memory', 'TaskRoleArn', 'ExecutionRoleArn', 'Volumes']:
        assert task[name] == current['Resources']['Task']['Properties'][name]
    return template

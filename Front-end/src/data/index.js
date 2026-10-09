export const MORPHEUS_RESOURCES = [
  { id:'r01', type:'vcenter',  icon:'⚙', name:'vme-cluster-01',   cloud:'HPE-VME',  env:'Production', hosts:4, vms:18, cpu:2,  mem:30, disk:5,  status:'ok',   lastSync:'11/12/2024 08:16 AM' },
  { id:'r02', type:'vcenter',  icon:'⚙', name:'VMware-cluster-01',   cloud:'VMware Vcenter',  env:'Production', hosts:2, vms:9,  cpu:45, mem:72, disk:61, status:'warn', lastSync:'11/12/2024 08:16 AM' },
  { id:'r06', type:'physical', icon:'▣', name:'bare-metal-rack-A', cloud:'On-Prem',  env:'Production', hosts:6, vms:0,  cpu:55, mem:62, disk:48, status:'ok',   lastSync:'11/12/2024 07:55 AM' },
]

export const TYPE_LABELS = {
  vcenter:'vCenter / HPE VM',
  physical:'Physical Servers', 
}

export const TOOLS = {
  metrics:[
    { id:'prometheus', name:'Prometheus', desc:'Pull-based metrics scraping', exporters:[
      {id:'node',      name:'Node Exporter',    desc:'Linux host CPU, RAM, disk, net'},
      {id:'blackbox',  name:'Blackbox Exporter', desc:'HTTP/HTTPS/TCP probing'},
      {id:'nginx',     name:'NGINX Exporter',    desc:'Request & connection metrics'},
      {id:'cadvisor',  name:'cAdvisor',          desc:'Container resource usage'},
      {id:'vmware',    name:'VMware Exporter',   desc:'vCenter / ESXi host metrics'},
      {id:'snmp',      name:'SNMP Exporter',     desc:'Network devices via SNMP'},
      {id:'postgres',  name:'Postgres Exporter', desc:'PostgreSQL query & table stats'},
      {id:'redis',     name:'Redis Exporter',    desc:'Redis memory, commands, latency'},
      {id:'ipmi',      name:'IPMI Exporter',     desc:'Bare-metal temperature, fan, power'},
      {id:'windows',   name:'Windows Exporter',  desc:'Windows host system metrics'},
    ]},
    { id:'victoria', name:'VictoriaMetrics', desc:'High-scale PromQL-compatible TSDB', exporters:[
      {id:'node',     name:'Node Exporter',    desc:'Linux host (via vmagent)'},
      {id:'blackbox', name:'Blackbox Exporter', desc:'Endpoint health probing'},
      {id:'cadvisor', name:'cAdvisor',          desc:'Container metrics'},
      {id:'vmware',   name:'VMware Exporter',   desc:'vCenter host metrics'},
      {id:'snmp',     name:'SNMP Exporter',     desc:'Network SNMP metrics'},
      {id:'postgres', name:'Postgres Exporter', desc:'Database metrics'},
      {id:'redis',    name:'Redis Exporter',    desc:'Redis metrics'},
      {id:'ipmi',     name:'IPMI Exporter',     desc:'Hardware sensor metrics'},
      {id:'windows',  name:'Windows Exporter',  desc:'Windows host metrics'},
    ]},
    { id:'telegraf', name:'Telegraf', desc:'Agent-based plugin collection', exporters:[
      {id:'cpu',     name:'CPU plugin',      desc:'Per-core CPU usage'},
      {id:'mem',     name:'Mem plugin',      desc:'Memory and swap stats'},
      {id:'disk',    name:'Disk plugin',     desc:'Disk usage and I/O'},
      {id:'net',     name:'Net plugin',      desc:'Network interface counters'},
      {id:'docker',  name:'Docker plugin',   desc:'Container stats'},
      {id:'snmp',    name:'SNMP plugin',     desc:'Network device SNMP'},
      {id:'vsphere', name:'vSphere plugin',  desc:'VMware vSphere metrics'},
      {id:'ipmi',    name:'IPMI plugin',     desc:'IPMI sensor data'},
    ]},
    { id:'zabbix', name:'Zabbix', desc:'Enterprise agent + SNMP monitoring', exporters:[
      {id:'agent',  name:'Zabbix Agent',   desc:'Passive/active host monitoring'},
      {id:'agent2', name:'Zabbix Agent 2', desc:'Plugin-based next-gen agent'},
      {id:'snmp',   name:'SNMP traps',     desc:'Network device traps'},
      {id:'ipmi',   name:'IPMI checks',    desc:'Hardware monitoring'},
      {id:'vmware', name:'VMware checks',  desc:'vCenter integration'},
      {id:'http',   name:'HTTP checks',    desc:'Web endpoint availability'},
    ]},
  ],
  logs:[
    { id:'loki', name:'Loki', desc:'Log aggregation — Grafana ecosystem', exporters:[
      {id:'promtail',  name:'Promtail',        desc:'Official Loki log shipper'},
      {id:'fluentbit', name:'Fluent Bit',       desc:'Fluent Bit → Loki plugin'},
      {id:'docker',    name:'Docker log driver',desc:'Container log forwarding'},
      {id:'syslog',    name:'Syslog receiver',  desc:'RFC5424 syslog ingestion'},
    ]},
    { id:'opensearch', name:'OpenSearch', desc:'Full-text log index and search', exporters:[
      {id:'logstash',    name:'Logstash',     desc:'ETL pipeline → OpenSearch'},
      {id:'fluentbit',   name:'Fluent Bit',    desc:'Lightweight log shipper'},
      {id:'filebeat',    name:'Filebeat',      desc:'Elastic Beats shipper'},
      {id:'data_prepper',name:'Data Prepper',  desc:'OpenSearch-native pipeline'},
    ]},
    { id:'fluentbit', name:'Fluent Bit', desc:'Lightweight forwarder & collector', exporters:[
      {id:'tail',    name:'Tail input',    desc:'Log file tailing'},
      {id:'syslog',  name:'Syslog input',  desc:'UDP/TCP syslog'},
      {id:'systemd', name:'Systemd input', desc:'journald ingestion'},
      {id:'docker',  name:'Docker input',  desc:'Container stdout/stderr'},
      {id:'kafka',   name:'Kafka output',  desc:'Forward to Kafka topic'},
    ]},
    { id:'elastic', name:'Elasticsearch', desc:'Distributed search and analytics', exporters:[
      {id:'filebeat',   name:'Filebeat',   desc:'Lightweight log shipper'},
      {id:'logstash',   name:'Logstash',   desc:'Full ETL pipeline'},
      {id:'metricbeat', name:'Metricbeat', desc:'System & service metrics'},
      {id:'auditbeat',  name:'Auditbeat',  desc:'Audit framework events'},
      {id:'winlogbeat', name:'Winlogbeat', desc:'Windows event logs'},
    ]},
    { id:'kafka', name:'Kafka', desc:'Durable event streaming bus', exporters:[
      {id:'fluentbit', name:'Fluent Bit producer', desc:'Lightweight log producer'},
      {id:'logstash',  name:'Logstash producer',   desc:'Full ETL → Kafka'},
      {id:'filebeat',  name:'Filebeat output',      desc:'Filebeat → Kafka'},
      {id:'streams',   name:'Kafka Streams',        desc:'Real-time stream processing'},
    ]},
  ],
}

export const DASHBOARD_OPTIONS = [
  { id:'grafana',  name:'Grafana',  sub:'Real-time operational dashboards', color:'#f39c12' },
  { id:'powerbi',  name:'Power BI', sub:'Executive reporting & capacity',   color:'#2980b9' },
  { id:'morpheus', name:'Morpheus', sub:'Inventory & lifecycle view',       color:'#00b796' },
]

export const MOCK_ALERTS = [
  { id:1, name:'Disk utilisation > 90%', resource:'prod-db-02',  env:'vCenter',  sev:'Critical', firedAgo:'4 min ago',  source:'Threshold breach · AWX queued',    status:'active',   canFix:true  },
  { id:2, name:'CPU spike 98%',          resource:'web-node-07', env:'AWS',      sev:'Critical', firedAgo:'9 min ago',  source:'Anomaly detected via Morpheus API', status:'active',   canFix:false },
  { id:3, name:'Memory pressure 85%',    resource:'svc-gateway', env:'Private',  sev:'Warning',  firedAgo:'22 min ago', source:'Threshold 85% · Watching',          status:'active',   canFix:false },
  { id:4, name:'Disk resolved',          resource:'prod-db-01',  env:'vCenter',  sev:'Resolved', firedAgo:'18 min ago', source:'Remediation completed',             status:'resolved', canFix:false },
]

export const MOCK_LOGS = [
  { time:'14:32:08', level:'ERROR', msg:'disk /var/lib/mysql at 91% — inode exhaustion imminent' },
  { time:'14:32:05', level:'WARN',  msg:'CPU softirq elevated — possible network storm' },
  { time:'14:31:58', level:'INFO',  msg:'connection pool at 82% capacity' },
  { time:'14:31:44', level:'INFO',  msg:'AWX playbook cleanup-disk.yml completed — freed 14.2 GB' },
  { time:'14:31:30', level:'WARN',  msg:'JWT validation latency 420ms (threshold: 200ms)' },
  { time:'14:31:12', level:'INFO',  msg:'Morpheus · vm-provision completed — labels synced' },
  { time:'14:30:55', level:'ERROR', msg:'net-core-sw-02 · SNMP timeout — retrying (2/3)' },
]

export const REMEDIATION_STEPS = [
  { delay:0,    msg:'Webhook received from AlertManager — disk 91%',       type:'run' },
  { delay:700,  msg:'AWX job #4471 triggered — cleanup-disk.yml',          type:'run' },
  { delay:1500, msg:'Connecting to resource via Morpheus API...',           type:'run' },
  { delay:2300, msg:'Scanning /var/log — found 8.4 GB rotated logs (7d+)', type:'run' },
  { delay:3100, msg:'Removing stale logs... freed 8.4 GB',                 type:'ok'  },
  { delay:3800, msg:'Scanning /tmp — found 5.8 GB temp files',             type:'run' },
  { delay:4500, msg:'Removing temp files... freed 5.8 GB',                 type:'ok'  },
  { delay:5100, msg:'Disk now at 68% — threshold cleared',                 type:'ok'  },
  { delay:5700, msg:'Audit entry written to config store',                  type:'ok'  },
  { delay:6100, msg:'Alert resolved — AlertManager notified',               type:'ok'  },
]

export const RBAC_USERS = [
  { init:'AO', name:'Admin Ops',    role:'Platform Admin',    scope:'All environments',  access:'Full',        color:'#00b796' },
  { init:'KM', name:'K. Mansour',   role:'NOC Engineer',      scope:'vCenter + AWS',     access:'Alerts/Logs', color:'#2980b9' },
  { init:'SR', name:'S. Rached',    role:'On-call Engineer',  scope:'vCenter only',      access:'Alerts',      color:'#f39c12' },
  { init:'DL', name:'D. Lamine',    role:'Dev Lead',          scope:'Private cloud',     access:'Logs',        color:'#2980b9' },
  { init:'EX', name:'Exec Viewer',  role:'Leadership',        scope:'All environments',  access:'Power BI',    color:'#00b796' },
]

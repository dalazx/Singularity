import React, {Component, PropTypes} from 'react';
import { connect } from 'react-redux';
import SelectFormGroup from '../common/formItems/formGroups/SelectFormGroup';
import TextFormGroup from '../common/formItems/formGroups/TextFormGroup';
import MultiInput from '../common/formItems/MultiInput';
import CheckBoxFormGroup from '../common/formItems/formGroups/CheckBoxFormGroup';
import RemoveButton from '../common/RemoveButton';
import { modifyField, clearForm } from '../../actions/form';
import {SaveAction} from '../../actions/api/deploy';
import { FIELDS, ARTIFACT_FIELDS, DOCKER_PORT_MAPPING_FIELDS, DOCKER_VOLUME_FIELDS, INDEXED_FIELDS,
  INDEXED_DOCKER_PORT_MAPPING_FIELDS, INDEXED_DOCKER_VOLUME_FIELDS, INDEXED_ALL_FIELDS, INDEXED_CUSTOM_EXECUTOR_FIELDS,
  INDEXED_DEFAULT_EXECUTOR_FIELDS, INDEXED_DOCKER_CONTAINER_FIELDS, INDEXED_LOAD_BALANCER_FIELDS, INDEXED_HEALTH_CHECKER_FIELDS,
  INDEXED_ALL_ARTIFACT_FIELDS, INDEXED_EMBEDDED_ARTIFACT_FIELDS, INDEXED_EXTERNAL_ARTIFACT_FIELDS, INDEXED_S3_ARTIFACT_FIELDS } from './fields';


const FORM_ID = 'newDeployForm';

const DEFAULT_EXECUTOR_TYPE = 'default';
const CUSTOM_EXECUTOR_TYPE = 'custom';
const ARTIFACT_SHAPE = PropTypes.shape({
  name: PropTypes.string,
  type: PropTypes.oneOf(['embedded', 'external', 's3']).isRequired,
  filename: PropTypes.string,
  md5Sum: PropTypes.string,
  content: PropTypes.string,
  url: PropTypes.string,
  filesize: PropTypes.string,
  s3Bucket: PropTypes.string,
  s3ObjectKey: PropTypes.string
});

class NewDeployForm extends Component {

  static propTypes = {
    form: PropTypes.shape({
      arguments: PropTypes.arrayOf(PropTypes.string),
      uris: PropTypes.arrayOf(PropTypes.string),
      embeddedArtifacts: PropTypes.arrayOf(ARTIFACT_SHAPE),
      externalArtifacts: PropTypes.arrayOf(ARTIFACT_SHAPE),
      s3Artifacts: PropTypes.arrayOf(ARTIFACT_SHAPE),
      cmd: PropTypes.string,
      extraCmdLineArgs: PropTypes.arrayOf(PropTypes.string),
      user: PropTypes.string,
      sigKillProcessesAfterMillis: PropTypes.string,
      successfulExitCodes: PropTypes.arrayOf(PropTypes.string),
      maxTaskThreads: PropTypes.string,
      loggingTag: PropTypes.string,
      loggingExtraFields: PropTypes.arrayOf(PropTypes.string),
      preserveTaskSandboxAfterFinish: PropTypes.bool,
      skipLogrotateAndCompress: PropTypes.bool,
      loggingS3Bucket: PropTypes.string,
      maxOpenFiles: PropTypes.string,
      runningSentinel: PropTypes.string,
      portMappings: PropTypes.arrayOf(PropTypes.shape({
        containerPortType: PropTypes.string,
        containerPort: PropTypes.string,
        hostPortType: PropTypes.string,
        hostPort: PropTypes.string,
        protocol: PropTypes.string
      })),
      volumes: PropTypes.arrayOf(PropTypes.shape({
        containerPath: PropTypes.string,
        hostPath: PropTypes.string,
        mode: PropTypes.string
      })),
      image: PropTypes.string,
      privileged: PropTypes.bool,
      forcePullImage: PropTypes.bool,
      parameters: PropTypes.arrayOf(PropTypes.string),
      id: PropTypes.string,
      command: PropTypes.string,
      type: PropTypes.string,
      cpus: PropTypes.string,
      memoryMb: PropTypes.string,
      numPorts: PropTypes.string,
      env: PropTypes.arrayOf(PropTypes.string),
      healthcheckUri: PropTypes.string,
      healthcheckIntervalSeconds: PropTypes.string,
      healthcheckTimeoutSeconds: PropTypes.string,
      healthcheckPortIndex: PropTypes.string,
      healthcheckMaxTotalTimeoutSeconds: PropTypes.string,
      deployHealthTimeoutSeconds: PropTypes.string,
      skipHealthchecksOnDeploy: PropTypes.bool,
      considerHealthyAfterRunningForSeconds: PropTypes.string,
      serviceBasePath: PropTypes.string,
      loadBalancerGroups: PropTypes.arrayOf(PropTypes.string),
      loadBalancerOptions: PropTypes.arrayOf(PropTypes.string),
      loadBalancerPortIndex: PropTypes.string,
      unpauseOnSuccessfulDeploy: PropTypes.bool
    }).isRequired,
    request: PropTypes.shape({
      state: PropTypes.string.isRequired,
      request: PropTypes.shape({
        requestType: PropTypes.string.isRequired,
        id: PropTypes.string.isRequired,
        loadBalanced: PropTypes.bool
      }).isRequired
    }).isRequired,
    saveApiCall: PropTypes.shape({
      error: PropTypes.bool,
      data: PropTypes.shape({
        message: PropTypes.string,
        activeDeploy: PropTypes.shape({
          id: PropTypes.string,
          requestId: PropTypes.string
        })
      })
    }),
    clearForm: PropTypes.func.isRequired,
    update: PropTypes.func.isRequired,
    save: PropTypes.func.isRequired
  };

  componentWillMount() {
    this.props.clearForm(FORM_ID);
  }

  updateField(fieldId, newValue) {
    this.props.update(FORM_ID, fieldId, newValue);
  }

  getValueOrDefault(fieldId) {
    return this.props.form[fieldId] || INDEXED_FIELDS[fieldId].default;
  }

  isRequestDaemon() {
    return ['SERVICE', 'WORKER'].indexOf(this.props.request.request.requestType) !== -1;
  }

  // Returns true unless the object is falsey or an empty array.
  hasValue(value) {
    if (!value) {
      return false;
    }
    if (Array.isArray(value) && _.isEmpty(value)) {
      return false;
    }
    return true;
  }

  validateValue(value, type, arrayType) {
    if (!value) {
      return true;
    }
    if (type === 'number') {
      const number = parseInt(value, 10);
      return number === 0 || number; // NaN is invalid
    } else if (type === 'map') {
      for (const element of value) {
        if (element.split('=').length !== 2) {
          return false;
        }
      }
    } else if (type === 'array') {
      for (const element of value) {
        if (!this.validateValue(element, arrayType)) {
          return false;
        }
      }
    }
    return true;
  }

  validateField(field, valueGetter) {
    const type = field.type;
    if (type === 'object') {
      for (const subField of field.values) {
        if (!this.validateField(subField)) {
          return false;
        }
      }
      return true;
    }
    const value = valueGetter(field.id);
    if (field.required && !this.hasValue(value)) {
      return false;
    }
    return this.validateValue(value, type, field.arrayType);
  }

  validateFields(fields) {
    for (const fieldId of Object.keys(fields)) {
      if (!this.validateField(fields[fieldId], (localFieldId) => this.getValueOrDefault(localFieldId))) {
        return false;
      }
    }
    return true;
  }

  validateObject(obj, fieldsToValidateAgainst) {
    for (const fieldId of Object.keys(fieldsToValidateAgainst)) {
      if (!this.validateField(fieldsToValidateAgainst[fieldId], (localFieldId) => obj[localFieldId] || fieldsToValidateAgainst[localFieldId].default)) {
        return false;
      }
    }
    return true;
  }

  validateObjects(idForObjects, fieldsToValidateAgainst) {
    const objects = this.getValueOrDefault(idForObjects);
    if (!objects) {
      return true;
    }
    for (const id of Object.keys(objects)) {
      if (!this.validateObject(objects[id], fieldsToValidateAgainst)) {
        return false;
      }
    }
    return true;
  }

  validateArtifacts() {
    for (const artifact of this.getValueOrDefault('embeddedArtifacts') || []) {
      if (!this.validateObject(artifact, INDEXED_ALL_ARTIFACT_FIELDS)) {
        return false;
      }
      if (!this.validateObject(artifact, INDEXED_EMBEDDED_ARTIFACT_FIELDS)) {
        return false;
      }
    }
    for (const artifact of this.getValueOrDefault('externalArtifacts') || []) {
      if (!this.validateObject(artifact, INDEXED_ALL_ARTIFACT_FIELDS)) {
        return false;
      }
      if (!this.validateObject(artifact, INDEXED_EXTERNAL_ARTIFACT_FIELDS)) {
        return false;
      }
    }
    for (const artifact of this.getValueOrDefault('s3Artifacts') || []) {
      if (!this.validateObject(artifact, INDEXED_ALL_ARTIFACT_FIELDS)) {
        return false;
      }
      if (artifact.type === 's3' && !this.validateObject(artifact, INDEXED_S3_ARTIFACT_FIELDS)) {
        return false;
      }
    }
    return true;
  }

  canSubmit() {
    if (!this.validateFields(INDEXED_ALL_FIELDS)) {
      return false;
    }
    if (this.getValueOrDefault('executorType') === CUSTOM_EXECUTOR_TYPE) {
      if (!this.validateFields(INDEXED_CUSTOM_EXECUTOR_FIELDS) || !this.validateArtifacts()) {
        return false;
      }
    } else if (!this.validateFields(INDEXED_DEFAULT_EXECUTOR_FIELDS)) {
      return false;
    }
    if (this.getValueOrDefault('type') === 'docker') {
      if (!this.validateFields(INDEXED_DOCKER_CONTAINER_FIELDS) ||
        !this.validateObjects('portMappings', INDEXED_DOCKER_PORT_MAPPING_FIELDS) ||
        !this.validateObjects('volumes', INDEXED_DOCKER_VOLUME_FIELDS)) {
        return false;
      }
    }
    if (this.props.request.request.loadBalanced && !this.validateFields(INDEXED_LOAD_BALANCER_FIELDS)) {
      return false;
    }
    if (this.isRequestDaemon() && !this.validateFields(INDEXED_HEALTH_CHECKER_FIELDS)) {
      return false;
    }
    return true;
  }

  copyFieldsToObject(deployObject, fieldsToAdd, valueGetter) {
    for (const fieldId of fieldsToAdd) {
      if (fieldId.type === 'object') {
        deployObject[fieldId.id] = this.copyFieldsToObject(
          deployObject[fieldId.id] || {},
          fieldId.values,
          (localFieldId) => this.getValueOrDefault(localFieldId));
      } else if (this.hasValue(valueGetter(fieldId.id))) {
        const value = valueGetter(fieldId.id);
        if (fieldId.type === 'text' || fieldId.type === 'array') {
          deployObject[fieldId.id] = value;
        } else if (fieldId.type === 'number') {
          deployObject[fieldId.id] = parseInt(value, 10);
        } else if (fieldId.type === 'base64') {
          deployObject[fieldId.id] = btoa(value);
        } else if (fieldId.type === 'map') {
          const map = {};
          for (const element of value) {
            const split = element.split('=');
            if (split.length !== 2) {
              continue;
            }
            map[split[0]] = split[1];
          }
          if (map) {
            deployObject[fieldId.id] = map;
          }
        } else if (fieldId.type === 'artifacts') {
          const artifacts = value.map(artifact => {
            const newArtifact = {};
            this.copyFieldsToObject(newArtifact, ARTIFACT_FIELDS.all, (id) => artifact[id] || INDEXED_ALL_ARTIFACT_FIELDS[id].default);
            if (artifact.type === 'embedded') {
              this.copyFieldsToObject(newArtifact, ARTIFACT_FIELDS.embedded, (id) => artifact[id] || INDEXED_ALL_ARTIFACT_FIELDS[id].default);
            }
            if (artifact.type === 'external') {
              this.copyFieldsToObject(newArtifact, ARTIFACT_FIELDS.external, (id) => artifact[id] || INDEXED_ALL_ARTIFACT_FIELDS[id].default);
            }
            if (artifact.type === 's3') {
              this.copyFieldsToObject(newArtifact, ARTIFACT_FIELDS.s3, (id) => artifact[id] || INDEXED_ALL_ARTIFACT_FIELDS[id].default);
            }
            return newArtifact;
          });
          deployObject[fieldId.id] = artifacts;
        } else if (fieldId.type === 'volumes') {
          const volumes = value.map(volume => this.copyFieldsToObject(
            {},
            DOCKER_VOLUME_FIELDS,
            (id) => volume[id] || INDEXED_DOCKER_VOLUME_FIELDS[id].default
          ));
          deployObject[fieldId.id] = volumes;
        } else if (fieldId.type === 'portMappings') {
          const portMappings = value.map(portMapping => this.copyFieldsToObject(
            {},
            DOCKER_PORT_MAPPING_FIELDS,
            (id) => portMapping[id] || INDEXED_DOCKER_PORT_MAPPING_FIELDS[id].default));
          deployObject[fieldId.id] = portMappings;
        }
      }
    }
    return deployObject;
  }

  submit(event) {
    event.preventDefault();
    const deployObject = {};
    this.copyFieldsToObject(deployObject, FIELDS.all, (fieldId) => this.getValueOrDefault(fieldId));
    if (this.getValueOrDefault('executorType') === DEFAULT_EXECUTOR_TYPE) {
      this.copyFieldsToObject(deployObject, FIELDS.defaultExecutor, (fieldId) => this.getValueOrDefault(fieldId));
    } else {
      this.copyFieldsToObject(deployObject, FIELDS.customExecutor, (fieldId) => this.getValueOrDefault(fieldId));
    }
    if (this.getValueOrDefault('type') === 'docker') {
      this.copyFieldsToObject(deployObject, FIELDS.dockerContainer, (fieldId) => this.getValueOrDefault(fieldId));
    }
    if (this.props.request.request.loadBalanced) {
      this.copyFieldsToObject(deployObject, FIELDS.loadBalancer, (fieldId) => this.getValueOrDefault(fieldId));
    }
    if (this.isRequestDaemon()) {
      this.copyFieldsToObject(deployObject, FIELDS.healthChecker, (fieldId) => this.getValueOrDefault(fieldId));
    }
    deployObject.requestId = this.props.request.request.id;
    this.props.save({deploy: deployObject});
  }

  addDeployObjectToArrayField(fieldId, deployObject) {
    if (!this.props.form[fieldId]) {
      this.updateField(fieldId, [deployObject]);
    } else {
      const fieldValue = this.props.form[fieldId].slice();
      fieldValue.push(deployObject);
      this.updateField(fieldId, fieldValue);
    }
  }

  addObjectToDeployFieldPreventDefault(fieldId, deployObject, event) {
    event.preventDefault();
    this.addDeployObjectToArrayField(fieldId, deployObject);
  }

  removeThingFromArrayField(fieldId, key) {
    const fieldValue = this.props.form[fieldId].slice();
    fieldValue.splice(key, 1);
    this.updateField(fieldId, fieldValue);
  }

  updateThingInArrayField(fieldId, key, newFieldObj) {
    const newArray = this.props.form[fieldId].slice();
    const newValue = _.extend({}, newArray[key], newFieldObj);
    newArray[key] = newValue;
    this.updateField(fieldId, newArray);
  }

  renderDefaultExecutorFields() {
    const cmdLineArguments = (
      <div className="form-group">
        <label htmlFor="cmd-line-args">Arguments</label>
        <MultiInput
          id = "cmd-line-args"
          value = {this.props.form.arguments || []}
          onChange = {(newValue) => this.updateField('arguments', newValue)}
        />
      </div>
    );
    const artifacts = (
      <div className="form-group">
        <label htmlFor="artifacts" >Artifacts</label>
        <MultiInput
          id = "artifacts"
          value = {this.props.form.uris || []}
          onChange = {(newValue) => this.updateField('uris', newValue)}
          placeholder="eg: http://s3.example/my-artifact"
        />
      </div>
    );
    return (
      <div>
        <fieldset id="default-expandable" className="expandable">
          <h4>Default Executor Settings</h4>
          {cmdLineArguments}
          {artifacts}
        </fieldset>
      </div>
    );
  }

  renderArtifact(artifact, key) {
    const arrayName = `${artifact.type}Artifacts`;
    const name = (
      <TextFormGroup
        id={`name-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {name: event.target.value})}
        value={artifact.name}
        label="Name"
        required={true}
      />
    );
    const fileName = (
      <TextFormGroup
        id={`filename-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {filename: event.target.value})}
        value={artifact.filename}
        label="File name"
        required={true}
      />
    );
    const md5Sum = (
      <TextFormGroup
        id={`md5-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {md5Sum: event.target.value})}
        value={artifact.md5Sum}
        label="MD5 checksum"
      />
    );
    const content = (
      <TextFormGroup
        id={`content-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {content: event.target.value})}
        value={artifact.content}
        label="Content"
      />
    );
    const filesize = (
      <TextFormGroup
        id={`file-size-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {filesize: event.target.value})}
        value={artifact.filesize}
        label="File size"
      />
    );
    const url = (
      <TextFormGroup
        id={`url-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {url: event.target.value})}
        value={artifact.url}
        label="URL"
        required={true}
      />
    );
    const s3Bucket = (
      <TextFormGroup
        id={`bucket-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {s3Bucket: event.target.value})}
        value={artifact.s3Bucket}
        label="S3 bucket"
        required={true}
      />
    );
    const s3ObjectKey = (
      <TextFormGroup
        id={`object-key-${ key }`}
        onChange={event => this.updateThingInArrayField(arrayName, key, {s3ObjectKey: event.target.value})}
        value={artifact.s3ObjectKey}
        label="S3 object key"
        required={true}
      />
    );
    return (
      <div key={key} className="well well-sm artifact">
        <h5>{artifact.type} artifact</h5>
        <RemoveButton
          id={`remove-artifact-${key}`}
          onClick={() => this.removeThingFromArrayField(arrayName, key) }
        />
        {name}
        {fileName}
        {md5Sum}
        {artifact.type === 'embedded' && content}
        {artifact.type !== 'embedded' && filesize}
        {artifact.type === 'external' && url}
        {artifact.type === 's3' && s3Bucket}
        {artifact.type === 's3' && s3ObjectKey}
      </div>
    );
  }

  renderCustomArtifactFields() {
    if (this.props.form.s3Artifacts || this.props.form.externalArtifacts || this.props.form.embeddedArtifacts) {
      return (
        <div id="custom-artifacts">
          {this.props.form.embeddedArtifacts && this.props.form.embeddedArtifacts.map((artifact, key) => this.renderArtifact(artifact, key))}
          {this.props.form.externalArtifacts && this.props.form.externalArtifacts.map((artifact, key) => this.renderArtifact(artifact, key))}
          {this.props.form.s3Artifacts && this.props.form.s3Artifacts.map((artifact, key) => this.renderArtifact(artifact, key))}
        </div>
      );
    }
    return null;
  }

  renderCustomExecutorFields() {
    const customExecutorCmds = (
      <TextFormGroup
        id="custom-executor-command"
        onChange={event => this.updateField('cmd', event.target.value)}
        value={this.props.form.cmd}
        label="Custom executor command"
        required={true}
        placeholder="eg: /usr/local/bin/singularity-executor"
      />
    );
    const extraCommandArgs = (
      <div className="form-group">
        <label htmlFor="extra-args">Extra command args</label>
        <MultiInput
          id = "extra-args"
          value = {this.props.form.extraCmdLineArgs || []}
          onChange = {(newValue) => this.updateField('extraCmdLineArgs', newValue)}
          placeholder="eg: -jar MyThing.jar"
        />
      </div>
    );
    const user = (
      <TextFormGroup
        id="user"
        onChange={event => this.updateField('user', event.target.value)}
        value={this.props.form.user}
        label="User"
        placeholder="default: root"
      />
    );
    const killAfterMillis = (
      <TextFormGroup
        id="kill-after-millis"
        onChange={event => this.updateField('sigKillProcessesAfterMillis', event.target.value)}
        value={this.props.form.sigKillProcessesAfterMillis}
        label="Kill processes after (milisec)"
        placeholder="default: 120000"
      />
    );
    const successfulExitCodes = (
      <div className="form-group">
        <label htmlFor="successful-exit-code">Successful exit codes</label>
        <MultiInput
          id = "successful-exit-code"
          value = {this.props.form.successfulExitCodes || []}
          onChange = {(newValue) => this.updateField('successfulExitCodes', newValue)}
        />
      </div>
    );
    const maxTaskThreads = (
      <TextFormGroup
        id="max-task-threads"
        onChange={event => this.updateField('maxTaskThreads', event.target.value)}
        value={this.props.form.maxTaskThreads}
        label="Max Task Threads"
      />
    );
    const loggingTag = (
      <TextFormGroup
        id="logging-tag"
        onChange={event => this.updateField('loggingTag', event.target.value)}
        value={this.props.form.loggingTag}
        label="Logging tag"
      />
    );
    const loggingExtraFields = (
      <div className="form-group">
        <label htmlFor="logging-extra-fields">Logging extra fields</label>
        <MultiInput
          id = "logging-extra-fields"
          value = {this.props.form.loggingExtraFields || []}
          onChange = {(newValue) => this.updateField('loggingExtraFields', newValue)}
          placeholder="format: key=value"
        />
      </div>
    );
    const preserveSandbox = (
      <CheckBoxFormGroup
        id = "preserve-sandbox"
        label="Preserve task sandbox after finish"
        checked = {this.props.form.preserveTaskSandboxAfterFinish}
        onChange = {(newValue) => this.updateField('preserveTaskSandboxAfterFinish', newValue)}
      />
    );
    const skipLogrotateAndCompress = (
      <CheckBoxFormGroup
        id = "skip-lr-compress"
        label="Skip lorotate compress"
        checked = {this.props.form.skipLogrotateAndCompress}
        onChange = {(newValue) => this.updateField('skipLogrotateAndCompress', newValue)}
      />
    );
    const loggingS3Bucket = (
      <TextFormGroup
        id="logging-s3-bucket"
        onChange={event => this.updateField('loggingS3Bucket', event.target.value)}
        value={this.props.form.loggingS3Bucket}
        label="Logging S3 Bucket"
      />
    );
    const maxOpenFiles = (
      <TextFormGroup
        id="max-open-files"
        onChange={event => this.updateField('maxOpenFiles', event.target.value)}
        value={this.props.form.maxOpenFiles}
        label="Max Open Files"
      />
    );
    const runningSentinel = (
      <TextFormGroup
        id="running-sentinel"
        onChange={event => this.updateField('runningSentinel', event.target.value)}
        value={this.props.form.runningSentinel}
        label="Running Sentinel"
      />
    );
    return (
      <div>
        <fieldset>
          <h4>Custom Executor Settingss</h4>

          {customExecutorCmds}
          {extraCommandArgs}

          <div className="row">
            <div className="col-md-6">
              {user}
            </div>
            <div className="col-md-6">
              {killAfterMillis}
            </div>
          </div>

          <div className="row">
            <div className="col-md-6">
              {successfulExitCodes}
            </div>
            <div className="col-md-6">
              {maxTaskThreads}
            </div>
          </div>

          <div className="row">
            <div className="col-md-6">
              {loggingTag}
            </div>
            <div className="col-md-6">
              {loggingExtraFields}
            </div>
          </div>

          <div className="row">
            <div className="col-md-6">
              {preserveSandbox}
            </div>
            <div className="col-md-6">
              {skipLogrotateAndCompress}
            </div>
          </div>

          <div className="row">
            <div className="col-md-6">
              {loggingS3Bucket}
            </div>
            <div className="col-md-6">
              {maxOpenFiles}
            </div>
          </div>

          {runningSentinel}
        </fieldset>

        <fieldset>
          <h4>Custom executor artifacts</h4>

          { this.renderCustomArtifactFields() }

          <div id="artifact-button-row" className="row">
            <div className="col-sm-4">
              <button className="btn btn-success btn-block" onClick={event => this.addObjectToDeployFieldPreventDefault('embeddedArtifacts', {type: 'embedded'}, event)}>
                <span className="glyphicon glyphicon-plus"></span>
                {" Embedded"}
              </button>
            </div>
            <div className="col-sm-4">
              <button className="btn btn-success btn-block" onClick={event => this.addObjectToDeployFieldPreventDefault('externalArtifacts', {type: 'external'}, event)}>
                <span className="glyphicon glyphicon-plus"></span>
                {" External"}
              </button>
            </div>
            <div className="col-sm-4">
              <button className="btn btn-success btn-block" onClick={event => this.addObjectToDeployFieldPreventDefault('s3Artifacts', {type: 's3'}, event)}>
                <span className="glyphicon glyphicon-plus"></span>
                {" S3"}
              </button>
            </div>
          </div>
        </fieldset>
      </div>
    );
  }

  renderDockerPortMapping(mapping, key) {
    const thisPortMapping = this.props.form.portMappings[key];
    const containerPortType = (
      <SelectFormGroup
        id={`cont-port-type-${ key }`}
        label="Container Port Type"
        value={thisPortMapping.containerPortType || INDEXED_DOCKER_PORT_MAPPING_FIELDS.containerPortType.default}
        defaultValue="LITERAL"
        onChange={newValue => this.updateThingInArrayField('portMappings', key, {containerPortType: newValue.value})}
        required={true}
        options={[
          { label: 'Literal', value: 'LITERAL' },
          { label: 'From Offer', value: 'FROM_OFFER' }
        ]}
      />
    );
    const containerPort = (
      <TextFormGroup
        id={`cont-port-${ key }`}
        onChange={event => this.updateThingInArrayField('portMappings', key, {containerPort: event.target.value})}
        value={thisPortMapping.containerPort}
        label="Container Port"
        required={true}
      />
    );
    const hostPortType = (
      <SelectFormGroup
        id={`host-port-type-${ key }`}
        label="Host Port Type"
        value={thisPortMapping.hostPortType || INDEXED_DOCKER_PORT_MAPPING_FIELDS.hostPortType.default}
        defaultValue="LITERAL"
        onChange={newValue => this.updateThingInArrayField('portMappings', key, {hostPortType: newValue.value})}
        required={true}
        options={[
          { label: 'Literal', value: 'LITERAL' },
          { label: 'From Offer', value: 'FROM_OFFER' }
        ]}
      />
    );
    const hostPort = (
      <TextFormGroup
        id={`host-port-${ key }`}
        onChange={event => this.updateThingInArrayField('portMappings', key, {hostPort: event.target.value})}
        value={thisPortMapping.hostPort}
        label="Host Port"
        required={true}
      />
    );
    const protocol = (
      <TextFormGroup
        id={`protocol-${ key }`}
        onChange={event => this.updateThingInArrayField('portMappings', key, {protocol: event.target.value})}
        value={thisPortMapping.protocol}
        label="Protocol"
        placeholder="default: tcp"
      />
    );
    return (
      <div className="well well-sm docker-port" key={key}>
        <h5>Docker Port Mapping</h5>
        <RemoveButton
          id={`remove-port-mapping-${key}`}
          onClick={() => this.removeThingFromArrayField('portMappings', key)}
        />
        {containerPortType}
        {containerPort}
        {hostPortType}
        {hostPort}
        {protocol}
      </div>
    );
  }

  renderDockerPortMappings() {
    const portMappings = this.props.form.portMappings;
    if (portMappings) {
      return portMappings.map((mapping, key) => this.renderDockerPortMapping(mapping, key));
    }
    return null;
  }

  renderDockerVolume(mapping, key) {
    const thisVolume = this.props.form.volumes[key];
    const containerPath = (
      <TextFormGroup
        id={`cont-path-${ key }`}
        onChange={event => this.updateThingInArrayField('volumes', key, {containerPath: event.target.value})}
        value={thisVolume.containerPath}
        label="Container Path"
        required={true}
      />
    );
    const hostPath = (
      <TextFormGroup
        id={`host-path-${ key }`}
        onChange={event => this.updateThingInArrayField('volumes', key, {hostPath: event.target.value})}
        value={thisVolume.hostPath}
        label="Host Path"
        required={true}
      />
    );
    const mode = (
      <SelectFormGroup
        id={`volume-mode-${ key }`}
        label="Volume Mode"
        value={thisVolume.mode || INDEXED_DOCKER_VOLUME_FIELDS.mode.default}
        defaultValue="RO"
        onChange={newValue => this.updateThingInArrayField('volumes', key, {mode: newValue.value})}
        required={true}
        options={[
          { label: 'RO', value: 'RO' },
          { label: 'RW', value: 'RW' }
        ]}
      />
    );
    return (
      <div className="well well-sm docker-volume" key={key}>
        <h5>Docker Volume</h5>
        <RemoveButton
          id={`remove-volume-${key}`}
          onClick={() => this.removeThingFromArrayField('volumes', key)}
        />
        {containerPath}
        {hostPath}
        {mode}
      </div>
    );
  }

  renderDockerVolumes() {
    const volumes = this.props.form.volumes;
    if (volumes) {
      return volumes.map((mapping, key) => this.renderDockerVolume(mapping, key));
    }
    return null;
  }

  renderDockerContainerFields() {
    const image = (
      <TextFormGroup
        id="docker"
        onChange={event => this.updateField('image', event.target.value)}
        value={this.props.form.image}
        label="Docker image"
        required={true}
        placeholder="eg: centos6:latest"
      />
    );
    const network = (
      <SelectFormGroup
        id="dockernetwork"
        label="Docker Network"
        value={this.getValueOrDefault('network')}
        onChange={newValue => this.updateField('network', newValue.value)}
        options={[
          { label: 'None', value: 'NONE' },
          { label: 'Bridge', value: 'BRIDGE' },
          { label: 'Host', value: 'HOST' }
        ]}
      />
    );
    const privileged = (
      <CheckBoxFormGroup
        id = "privileged"
        label="Privileged"
        checked = {this.props.form.privileged}
        onChange = {(newValue) => this.updateField('privileged', newValue)}
      />
    );
    const forcePullImage = (
      <CheckBoxFormGroup
        id = "force-pull"
        label="Force Pull Image"
        checked = {this.props.form.forcePullImage}
        onChange = {(newValue) => this.updateField('forcePullImage', newValue)}
      />
    );
    const parameters = (
      <div className="form-group">
        <label htmlFor="docker-params">Docker Parameters</label>
        <MultiInput
          id = "docker-params"
          value = {this.props.form.parameters || []}
          onChange = {(newValue) => this.updateField('parameters', newValue)}
          placeholder="format: key=value"
        />
      </div>
    );
    //
    return (
      <div className="container-info">
        <fieldset>
          <h4>Docker Settings</h4>

          {image}
          {network}

          <div className="row">
            <div className="col-md-6">
              {privileged}
            </div>
            <div className="col-md-6">
              {forcePullImage}
            </div>
          </div>

          {parameters}

          {this.renderDockerPortMappings()}

          <div id="docker-port-button-row" className="row">
            <div className="col-sm-6">
              <button className="btn btn-success btn-block" onClick={event => this.addObjectToDeployFieldPreventDefault('portMappings', {}, event)}>
                <span className="glyphicon glyphicon-plus"></span>
                {" Docker Port Mapping"}
              </button>
            </div>
          </div>

          {this.renderDockerVolumes()}

          <div id="docker-volume-button-row" className="row">
            <div className="col-sm-6">
              <button className="btn btn-success btn-block" onClick={event => this.addObjectToDeployFieldPreventDefault('volumes', {}, event)}>
                <span className="glyphicon glyphicon-plus"></span>
                {" Docker Volume"}
              </button>
            </div>
          </div>

        </fieldset>
      </div>
    );
  }

  render() {
    // Fields
    const deployId = (
      <TextFormGroup
        id="id"
        onChange={event => this.updateField('id', event.target.value)}
        value={this.props.form.id}
        label="Deploy ID"
        required={true}
      />
    );
    const executorType = (
      <SelectFormGroup
        id="executor-type"
        label="Executor type"
        value={this.getValueOrDefault('executorType')}
        onChange={newValue => this.updateField('executorType', newValue.value)}
        required={true}
        options={[
          { label: 'Default', value: DEFAULT_EXECUTOR_TYPE },
          { label: 'Custom', value: CUSTOM_EXECUTOR_TYPE }
        ]}
      />
    );
    const command = (
      <TextFormGroup
        id="command"
        onChange={event => this.updateField('command', event.target.value)}
        value={this.props.form.command}
        label="Command to execute"
        placeholder="eg: rm -rf /"
      />
    );
    const type = (
      <SelectFormGroup
        id="container-type"
        label="Container type"
        value={this.props.form.type}
        onChange={newValue => this.updateField('type', newValue.value)}
        required={true}
        options={[
          { label: 'Mesos', value: 'mesos' },
          { label: 'Docker', value: 'docker' }
        ]}
      />
    );
    const cpus = (
      <TextFormGroup
        id="cpus"
        onChange={event => this.updateField('cpus', event.target.value)}
        value={this.props.form.cpus}
        label="CPUs"
        placeholder={`default: ${config.defaultCpus}`}
      />
    );
    const memoryMb = (
      <TextFormGroup
        id="memory-mb"
        onChange={event => this.updateField('memoryMb', event.target.value)}
        value={this.props.form.memoryMb}
        label="Memory (MB)"
        placeholder={`default: ${config.defaultMemory}`}
      />
    );
    const numPorts = (
      <TextFormGroup
        id="cpus"
        onChange={event => this.updateField('numPorts', event.target.value)}
        value={this.props.form.numPorts}
        label="Num. ports"
        placeholder="default: 0"
      />
    );
    const env = (
      <div className="form-group">
        <label htmlFor="env-vars">Environment variables</label>
        <MultiInput
          id = "env-vars"
          value = {this.props.form.env || []}
          onChange = {(newValue) => this.updateField('env', newValue)}
          placeholder="format: key=value"
        />
      </div>
    );
    const healthcheckUri = (
      <TextFormGroup
        id="healthcheck-uri"
        onChange={event => this.updateField('healthcheckUri', event.target.value)}
        value={this.props.form.healthcheckUri}
        label="Healthcheck URI"
      />
    );
    const healthcheckIntervalSeconds = (
      <TextFormGroup
        id="healthcheck-interval"
        onChange={event => this.updateField('healthcheckIntervalSeconds', event.target.value)}
        value={this.props.form.healthcheckIntervalSeconds}
        label="HC interval (sec)"
        placeholder="default: 5"
      />
    );
    const healthcheckTimeoutSeconds = (
      <TextFormGroup
        id="healthcheck-timeout"
        onChange={event => this.updateField('healthcheckTimeoutSeconds', event.target.value)}
        value={this.props.form.healthcheckTimeoutSeconds}
        label="HC timeout (sec)"
        placeholder="default: 5"
      />
    );
    const healthcheckPortIndex = (
      <TextFormGroup
        id="healthcheck-port-index"
        onChange={event => this.updateField('healthcheckPortIndex', event.target.value)}
        value={this.props.form.healthcheckPortIndex}
        label="HC Port Index"
        placeholder="default: 0 (first allocated port)"
      />
    );
    const healthcheckMaxTotalTimeoutSeconds = (
      <TextFormGroup
        id="total-healthcheck-timeout"
        onChange={event => this.updateField('healthcheckMaxTotalTimeoutSeconds', event.target.value)}
        value={this.props.form.healthcheckMaxTotalTimeoutSeconds}
        label="Total Healthcheck Timeout (sec)"
        placeholder="default: None"
      />
    );
    const deployHealthTimeoutSeconds = (
      <TextFormGroup
        id="deploy-healthcheck-timeout"
        onChange={event => this.updateField('deployHealthTimeoutSeconds', event.target.value)}
        value={this.props.form.deployHealthTimeoutSeconds}
        label="Deploy healthcheck timeout (sec)"
        placeholder="default: 120"
      />
    );
    const healthCheckProtocol = (
      <SelectFormGroup
        id="hc-protocol"
        label="HC Protocol"
        value={this.getValueOrDefault('healthCheckProtocol')}
        onChange={newValue => this.updateField('healthCheckProtocol', newValue.value)}
        options={[
          { label: 'HTTP', value: 'HTTP' },
          { label: 'HTTPS', value: 'HTTPS' }
        ]}
      />
    );
    const skipHealthchecksOnDeploy = (
      <CheckBoxFormGroup
        id = "skip-healthcheck"
        label="Skip healthcheck on deploy"
        checked = {this.props.form.skipHealthchecksOnDeploy}
        onChange = {(newValue) => this.updateField('skipHealthchecksOnDeploy', newValue)}
      />
    );
    const considerHealthyAfterRunningForSeconds = (
      <TextFormGroup
        id="consider-healthy-after"
        onChange={event => this.updateField('considerHealthyAfterRunningForSeconds', event.target.value)}
        value={this.props.form.considerHealthyAfterRunningForSeconds}
        label="Consider Healthy After Running For (sec)"
        placeholder="default: 5"
      />
    );
    const serviceBasePath = (
      <TextFormGroup
        id="service-base-path"
        onChange={event => this.updateField('serviceBasePath', event.target.value)}
        value={this.props.form.serviceBasePath}
        label="Service base path"
        placeholder="eg: /singularity/api/v2"
        required={true}
      />
    );
    const loadBalancerGroups = (
      <div className="form-group required">
        <label htmlFor="env-vars">Load balancer groups</label>
        <MultiInput
          id = "lb-group"
          value = {this.props.form.loadBalancerGroups || []}
          onChange = {(newValue) => this.updateField('loadBalancerGroups', newValue)}
        />
      </div>
    );
    const loadBalancerOptions = (
      <div className="form-group">
        <label htmlFor="env-vars">Load balancer options</label>
        <MultiInput
          id = "lb-option"
          value = {this.props.form.loadBalancerOptions || []}
          onChange = {(newValue) => this.updateField('loadBalancerOptions', newValue)}
          placeholder="format: key=value"
        />
      </div>
    );
    const loadBalancerPortIndex = (
      <TextFormGroup
        id="lb-port-index"
        onChange={event => this.updateField('loadBalancerPortIndex', event.target.value)}
        value={this.props.form.loadBalancerPortIndex}
        label="Load balancer port index"
        placeholder="default: 0 (first allocated port)"
      />
    );
    const unpauseOnSuccessfulDeploy = (
      <CheckBoxFormGroup
        id = "deploy-to-unpause"
        label="Unpause on successful deploy"
        checked = {this.props.form.unpauseOnSuccessfulDeploy}
        onChange = {(newValue) => this.updateField('unpauseOnSuccessfulDeploy', newValue)}
      />
    );

    // Groups
    const executorInfo = (
      <div className="well">
        <div className="row">
          <div className="col-md-4">
              <h3>Executor Info</h3>
          </div>
          <div className="col-md-8">
              {executorType}
          </div>
        </div>
        {command}
        { this.getValueOrDefault('executorType') === DEFAULT_EXECUTOR_TYPE && this.renderDefaultExecutorFields() }
        { this.getValueOrDefault('executorType') === CUSTOM_EXECUTOR_TYPE && this.renderCustomExecutorFields() }
      </div>
    );
    const containerInfo = (
      <div className="well">
        <div className="row">
          <div className="col-md-4">
            <h3>Container Info</h3>
          </div>
          <div className="col-md-8">
            {type}
          </div>
        </div>

        { this.getValueOrDefault('type') === 'docker' && this.renderDockerContainerFields() }
      </div>
    );
    const resources = (
      <div className="well">
        <h3>Resources</h3>
        <fieldset>
          <div className="row">
            <div className="col-sm-4">
              {cpus}
            </div>

            <div className="col-sm-4">
              {memoryMb}
            </div>

            <div className="col-sm-4">
              {numPorts}
            </div>
          </div>
        </fieldset>
      </div>
    );
    const variables = (
      <div className="well">
        <h3>Variables</h3>
        <fieldset>
          {env}
        </fieldset>
      </div>
    );
    const health = (
      <div className="well">
        <h3>Deploy Health</h3>
        <fieldset>
          {this.props.request.request.requestType === 'SERVICE' &&
            <div>
              {healthcheckUri}
              <div className="row">
                <div className="col-md-6">
                  {healthcheckIntervalSeconds}
                </div>
                <div className="col-md-6">
                  {healthcheckTimeoutSeconds}
                </div>
              </div>
              <div className="row">
                <div className="col-md-6">
                  {healthcheckPortIndex}
                </div>
                <div className="col-md-6">
                  {healthcheckMaxTotalTimeoutSeconds}
                </div>
              </div>
              <div className="row">
                <div className="col-md-6">
                  {deployHealthTimeoutSeconds}
                </div>
                <div className="col-md-6">
                  {healthCheckProtocol}
                </div>
              </div>
              <div className="row">
                <div className="col-md-6">
                  {skipHealthchecksOnDeploy}
                </div>
              </div>
            </div>}
          {this.props.request.request.requestType !== 'SERVICE' && considerHealthyAfterRunningForSeconds}
        </fieldset>
      </div>
    );
    const loadBalancer = (
      <div className="well">
        <h3>Load Balancer</h3>
        <fieldset>
          {serviceBasePath}
          {loadBalancerGroups}
          {loadBalancerOptions}
          {loadBalancerPortIndex}
        </fieldset>
      </div>
    );
    const unpause = (
      <div className="well">
        <h3>Unpause</h3>
        <fieldset>
          {unpauseOnSuccessfulDeploy}
        </fieldset>
      </div>
    );

    const errorMessage = (
      this.props.saveApiCall.error &&
        <p className="alert alert-danger">
          There was a problem saving your request: {this.props.saveApiCall.error.message}
        </p> ||
        this.props.saveApiCall.data && this.props.saveApiCall.data.message &&
        <p className="alert alert-danger">
          There was a problem saving your request: {this.props.saveApiCall.data.message}
        </p>
    );
    const successMessage = (
      this.props.saveApiCall.data.activeDeploy &&
        <p className="alert alert-success">
          Deploy
          <a
            href={`${config.appRoot}/request/${ this.props.saveApiCall.data.activeDeploy.requestId }/deploy/${ this.props.saveApiCall.data.activeDeploy.id }`}
            >
            {` ${this.props.saveApiCall.data.activeDeploy.id} `}
          </a>
          succesfully created!
        </p>
    );

    return (
      <div>
        <h2>
          New deploy for <a href={`${ config.appRoot }/request/${ this.props.request.request.id }`}>{ this.props.request.request.id }</a>
        </h2>
        <div className="row new-form">
          <form className="col-md-8" role="form" onSubmit={event => this.submit(event)}>

            {deployId}
            {executorInfo}
            {containerInfo}
            {resources}
            {variables}
            {this.isRequestDaemon() && health}
            {this.isRequestDaemon() && this.props.request.request.loadBalanced && loadBalancer}
            {this.props.request.state === 'PAUSED' && unpause}

            <div id="button-row">
              <span>
                <button type="submit" className="btn btn-success btn-lg" disabled={!this.canSubmit()}>
                  Deploy
                </button>
              </span>
            </div>

            {errorMessage || successMessage}

          </form>
          <div id="help-column" className="col-md-4 col-md-offset-1" />
        </div>
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    request: state.api.request.data,
    form: state.form[FORM_ID],
    saveApiCall: state.api.saveDeploy
  };
}

function mapDispatchToProps(dispatch) {
  return {
    update(formId, fieldId, newValue) {
      dispatch(modifyField(formId, fieldId, newValue));
    },
    clearForm(formId) {
      dispatch(clearForm(formId));
    },
    save(deployBody) {
      dispatch(SaveAction.trigger(deployBody));
    }
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(NewDeployForm);
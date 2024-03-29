/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015, 2016 Minio, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.getConcater = getConcater;
exports.getErrorTransformer = getErrorTransformer;
exports.getHashSummer = getHashSummer;
exports.getCopyObjectTransformer = getCopyObjectTransformer;
exports.getListBucketTransformer = getListBucketTransformer;
exports.getListMultipartTransformer = getListMultipartTransformer;
exports.getListPartsTransformer = getListPartsTransformer;
exports.getInitiateMultipartTransformer = getInitiateMultipartTransformer;
exports.getListObjectsTransformer = getListObjectsTransformer;
exports.getListObjectsV2Transformer = getListObjectsV2Transformer;
exports.getCompleteMultipartTransformer = getCompleteMultipartTransformer;
exports.getBucketRegionTransformer = getBucketRegionTransformer;
exports.getBucketNotificationTransformer = getBucketNotificationTransformer;
exports.getNotificationTransformer = getNotificationTransformer;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _xmlParsersJs = require('./xml-parsers.js');

var xmlParsers = _interopRequireWildcard(_xmlParsersJs);

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

var _through2 = require('through2');

var _through22 = _interopRequireDefault(_through2);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _jsonStream = require('json-stream');

var _jsonStream2 = _interopRequireDefault(_jsonStream);

var _helpersJs = require('./helpers.js');

var _errorsJs = require('./errors.js');

var errors = _interopRequireWildcard(_errorsJs);

// getConcater returns a stream that concatenates the input and emits
// the concatenated output when 'end' has reached. If an optional
// parser function is passed upon reaching the 'end' of the stream,
// `parser(concatenated_data)` will be emitted.

function getConcater(parser, emitError) {
  var objectMode = false;
  var bufs = [];

  if (parser && !(0, _helpersJs.isFunction)(parser)) {
    throw new TypeError('parser should be of type "function"');
  }

  if (parser) {
    objectMode = true;
  }

  return (0, _through22['default'])({ objectMode: objectMode }, function (chunk, enc, cb) {
    bufs.push(chunk);
    cb();
  }, function (cb) {
    if (emitError) {
      cb(parser(Buffer.concat(bufs).toString()));
      // cb(e) would mean we have to emit 'end' by explicitly calling this.push(null)
      this.push(null);
      return;
    }
    if (bufs.length) {
      if (parser) {
        this.push(parser(Buffer.concat(bufs).toString()));
      } else {
        this.push(Buffer.concat(bufs));
      }
    }
    cb();
  });
}

// Generates an Error object depending on http statusCode and XML body

function getErrorTransformer(response) {
  var statusCode = response.statusCode;
  var code, message;
  if (statusCode === 301) {
    code = 'MovedPermanently';
    message = 'Moved Permanently';
  } else if (statusCode === 307) {
    code = 'TemporaryRedirect';
    message = 'Are you using the correct endpoint URL?';
  } else if (statusCode === 403) {
    code = 'AccessDenied';
    message = 'Valid and authorized credentials required';
  } else if (statusCode === 404) {
    code = 'NotFound';
    message = 'Not Found';
  } else if (statusCode === 405) {
    code = 'MethodNotAllowed';
    message = 'Method Not Allowed';
  } else if (statusCode === 501) {
    code = 'MethodNotAllowed';
    message = 'Method Not Allowed';
  } else {
    code = 'UnknownError';
    message = '' + statusCode;
  }

  var headerInfo = {};
  // A value created by S3 compatible server that uniquely identifies
  // the request.
  headerInfo.amzRequestid = response.headersSent ? response.getHeader('x-amz-request-id') : null;
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headersSent ? response.getHeader('x-amz-id-2') : null;
  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headersSent ? response.getHeader('x-amz-bucket-region') : null;

  return getConcater(function (xmlString) {
    var getError = function getError() {
      // Message should be instantiated for each S3Errors.
      var e = new errors.S3Error(message);
      // S3 Error code.
      e.code = code;
      _.each(headerInfo, function (value, key) {
        e[key] = value;
      });
      return e;
    };
    if (!xmlString) {
      return getError();
    }
    var e = undefined;
    try {
      e = xmlParsers.parseError(xmlString, headerInfo);
    } catch (ex) {
      return getError();
    }
    return e;
  }, true);
}

// A through stream that calculates md5sum and sha256sum

function getHashSummer(enableSHA256) {
  var md5 = _crypto2['default'].createHash('md5');
  var sha256 = _crypto2['default'].createHash('sha256');

  return _through22['default'].obj(function (chunk, enc, cb) {

    if (enableSHA256) {
      sha256.update(chunk);
    } else {
      md5.update(chunk);
    }
    cb();
  }, function (cb) {
    var md5sum = '';
    var sha256sum = '';
    if (enableSHA256) {
      sha256sum = sha256.digest('hex');
    } else {
      md5sum = md5.digest('base64');
    }
    var hashData = { md5sum: md5sum, sha256sum: sha256sum };
    this.push(hashData);
    this.push(null);
    cb();
  });
}

// Following functions return a stream object that parses XML
// and emits suitable Javascript objects.

// Parses CopyObject response.

function getCopyObjectTransformer() {
  return getConcater(xmlParsers.parseCopyObject);
}

// Parses listBuckets response.

function getListBucketTransformer() {
  return getConcater(xmlParsers.parseListBucket);
}

// Parses listMultipartUploads response.

function getListMultipartTransformer() {
  return getConcater(xmlParsers.parseListMultipart);
}

// Parses listParts response.

function getListPartsTransformer() {
  return getConcater(xmlParsers.parseListParts);
}

// Parses initMultipartUpload response.

function getInitiateMultipartTransformer() {
  return getConcater(xmlParsers.parseInitiateMultipart);
}

// Parses listObjects response.

function getListObjectsTransformer() {
  return getConcater(xmlParsers.parseListObjects);
}

// Parses listObjects response.

function getListObjectsV2Transformer() {
  return getConcater(xmlParsers.parseListObjectsV2);
}

// Parses completeMultipartUpload response.

function getCompleteMultipartTransformer() {
  return getConcater(xmlParsers.parseCompleteMultipart);
}

// Parses getBucketLocation response.

function getBucketRegionTransformer() {
  return getConcater(xmlParsers.parseBucketRegion);
}

// Parses GET/SET BucketNotification response

function getBucketNotificationTransformer() {
  return getConcater(xmlParsers.parseBucketNotification);
}

// Parses a notification.

function getNotificationTransformer() {
  // This will parse and return each object.
  return new _jsonStream2['default']();
}
//# sourceMappingURL=transformers.js.map

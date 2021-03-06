/*jshint node:true, eqnull:true, laxcomma:true, undef:true, indent:2, camelcase:false */

'use strict';

var Prismic = require('prismic.io').Prismic;
var Configuration = require('./prismic-configuration').Configuration;

var _ = require('lodash');


exports.previewCookie = Prismic.previewCookie;

// -- Helpers

exports.getApiHome = function(accessToken, callback) {
  Prismic.Api(Configuration.apiEndpoint, callback, accessToken);
};

exports.getDocument = function(ctx, id, slug, type, onSuccess, onNewSlug, onNotFound) {
  var _type;
  if (!_type) {
    _type = 'everything';
  } else {
    _type = type;
  }

  ctx.api.forms(_type).ref(ctx.ref).query('[[:d = at(document.id, "' + id + '")]]').submit(function(err, documents) {
    var results = documents.results;
    var doc = results && results.length ? results[0] : undefined;
    if (err) onSuccess(err);
    else if(doc && (!slug || doc.slug == slug)) onSuccess(null, doc);
    else if(doc && doc.slugs.indexOf(slug) > -1 && onNewSlug) onNewSlug(doc);
    else if(onNotFound) onNotFound();
    else onSuccess();
  });
};

exports.getDocuments = function(ctx, ids, callback) {
  if(ids && ids.length) {
    ctx.api.forms('everything').ref(ctx.ref).query('[[:d = any(document.id, [' + ids.map(function(id) { return '"' + id + '"';}).join(',') + '])]]').submit(function(err, documents) {
      callback(err, documents.results);
    });
  } else {
    callback(null, []);
  }
};


/**
  - for GSO cats
**/
exports.getCategories = function (ctx, callback) {
  ctx.api.forms('categorie').ref(ctx.ref).query('').submit(function (err, categories) {

    var _cats = _.map(categories.results, function (c) {
                      return {
                      'id': c.id,
                      'slug': c.slug,
                      'titolo': c.fragments['categoria.title'].value[0].text,
                      'padre': c.fragments['categoria.parent'] ? c.fragments['categoria.parent'].value.document.id : 'parent',
                      'posizione': parseInt(c.fragments['categoria.position'].value, 10) || 100
                    };
                  });
    //console.log('cats before', _cats);

    var _groupedCats = _.chain(_cats)
                        .sortBy(function (cat) {
                          return cat.posizione;
                        })
                        .groupBy(function (cat) {
                          return cat.padre;
                        })
                        .value();

    var _finalArray = _.map(_groupedCats.parent, function (p) {
      p.sottocategorie = _groupedCats[p.id] || [];
      delete p.padre;
      return p;
    });
    //console.log('cats after', _cats);


    //console.log(_.difference(_.pluck(_cats, 'id'), _.pluck(_finalArray, 'id')));


    /*
      _finalArray is for menu
      _cats is for finding in pages
    */

    callback(err, _finalArray, _cats, categories.results);
  });
};


/**
  - for GSO authors
**/
exports.getAuthors = function (ctx, callback) {
  ctx.api.forms('autori').ref(ctx.ref).query('').submit(function (err, authors) {

    var _authors = _.chain(authors.results)
                  .map(function (a) {
                      return {
                      'id': a.id,
                      'slug': a.slug,
                      'name': a.fragments['autore.name'].value[0].text,
                      'pic': a.fragments['autore.profilePic'].value.views
                    };
                  })
                  .value();

    callback(err, _authors);
  });
};



exports.getBookmark = function(ctx, bookmark, callback) {
  var id = ctx.api.bookmarks[bookmark];
  if(id) {
    exports.getDocument(ctx, id, undefined, callback);
  } else {
    callback();
  }
};

// -- Exposing as a helper what to do in the event of an error (please edit prismic-configuration.js to change this)
exports.onPrismicError = Configuration.onPrismicError;



// -- Route wrapper that provide a "prismic context" to the underlying function
exports.route = function(callback) {
  return function(req, res) {
    var accessToken = (req.session && req.session.ACCESS_TOKEN) || Configuration.accessToken;
    exports.getApiHome(accessToken, function(err, Api) {
      if (err) {
          exports.onPrismicError(err, req, res);
          return;
      }
      var ctx = {
            api: Api,
            ref: req.cookies[Prismic.experimentCookie] || req.cookies[Prismic.previewCookie] || Api.master(),
            linkResolver: function(doc) {
              return Configuration.linkResolver(doc);
            }
          };
      res.locals.ctx = ctx;
      callback(req, res, ctx);
    });
  };
};



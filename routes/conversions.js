var express = require('express');
var router = express.Router();
var Utils = require('../utils');
var Callback = require('../scripts/callback');
var UAParser = require('ua-parser-js');
var path = require('path');

// inlcude Models
var Click = require('../models/clicktrack');
var Ad = require('../models/ad');
var Conversion = require('../models/conversion');
var Advert = require('../models/affiliate');


// Capture tracking request
router.get('/acquisition', function (req, res, next) {
    var cid = req.query.click_id,
        callback = req.query.callback || 'callback';

    var msg = { success: true };
    var output = callback + "(" + JSON.stringify(msg) + ")";
    Conversion.process({_id: cid}, req, function (err, success) {
        res.send(output);
    });
});

router.get('/pixel', function (req, res, next) {
    var ckid = req.cookies.__vnativetracking;
    var adid = req.query.adid;
    var advert_id = req.query.advert_id;

    if (!ckid && !adid) {
        if (req.query.ckid) {
            res.cookie('__vnativetracking', req.query.ckid, {
                path: '/',
                domain: req.headers['host'],
                httpOnly: true,
                expires: new Date(Date.now() + 86400000 * 365)
            });
        }
        res.sendFile(path.join(__dirname, '../public/_blue.gif'));
    } else {
        Conversion.process({cookie: ckid, adid: adid}, req, function (err, success) {
            // send an image
            if (advert_id) {
                Advert.findOne({ _id: advert_id }, function (err, affiliate) {
                    if (err || !affiliate) return false;

                    var newMeta = affiliate.meta;
                    newMeta['pixel'] = 'working';

                    Advert.update({ _id: affiliate._id }, { $set: {meta: newMeta}}, function (err) {
                        // do something
                    });
                });
            }
            res.sendFile(path.join(__dirname, '../public/_blue.gif'));
        });
    }
});

// https://play.google.com/store/apps/details?id=com.swiftintern&referrer=utm_source%3Dclick_id%26utm_medium%3Daffiliate%26utm_term%3Dreferer%26utm_content%3Duser_id%26utm_campaign%3Dad_id
// request will be containing the part from referrer={url_encoded}
router.get('/app', function (req, res, next) {
    var params = req.query;

    var errObj = { success: false, error: "Invalid Request" };
    if (params.utm_medium !== 'affiliate') {
        return res.json(errObj);
    }

    var extra = { referer: params.utm_term };
    Conversion.process({ _id: params.utm_content, extra: extra }, req, function (err, done) {
        if (err) return res.json(errObj);

        return res.json({ success: true });
    });
});

// When click is send by the JS added on advertiser website because we are
// not using proxy domain directly redirecting to the Final Website
router.get('/track/click', function (req, res, next) {
    var parser = new UAParser(req.headers['user-agent']);
    var adid = req.query.adid, pid = req.query.pid,
        referer = req.get('Referrer'),
        navigator = Boolean(Number(req.query.u || "0")),
        userAgent = req.query.ua || "";

    var ua = (new Buffer(userAgent, 'base64')).toString('ascii');
    var ti = Number(req.query.ti || "NaN");
    // some basic checks
    if (!referer || !navigator || ua !== req.headers['user-agent'] || isNaN(ti)) {
        return res.sendFile(path.join(__dirname, '../public/_blue.gif'));
    }

    Ad.findOne({ _id: adid }, '_id', function (err, ad) {
        if (err || !ad) {
            return res.sendFile(path.join(__dirname, '../public/_blue.gif'));
        }

        var parser = new UAParser(req.headers['user-agent']);
        var uaResult = parser.getResult();
        var extra = { browser: uaResult.browser.name, country: Utils.findCountry(req), referer: referer, device: Utils.device(req) };
        if (uaResult.os.name) {
            extra['os'] = uaResult.os.name;
        }
        
        Click.process({
            adid: adid, ipaddr: Utils.getClientIP(req),
            cookie: req.query.ckid, pid: pid, req: req
        }, extra, function () {

        });
        res.sendFile(path.join(__dirname, '../public/_blue.gif'));
    });
});

module.exports = router;

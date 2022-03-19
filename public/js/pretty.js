/*
 * JavaScript Pretty Date
 * Copyright (c) 2011 John Resig (ejohn.org)
 * Licensed under the MIT and GPL licenses.
 */

// Takes an ISO time and returns a string representing how
// long ago the date represents.
function prettyDate(time) {
	const date = new Date(time * 1000);
	const diff = (new Date().getTime() - date.getTime()) / 1000;
	const day_diff = Math.floor(diff / 86400);

	if (isNaN(day_diff) || day_diff < 0) {
		return;
	}

	if (day_diff === 0) {
		if (diff < 60) {
			return 'just now';
		}

		if (diff < 120) {
			return '1 minute ago';
		}

		if (diff < 3600) {
			return `${Math.floor(diff / 60)} minutes ago`;
		}

		if (diff < 7200) {
			return '1 hour ago';
		}

		if (diff < 86400) {
			return `${Math.floor(diff / 3600)} hours ago`;
		}
	}

	return ``;
}

// If jQuery is included in the page, adds a jQuery plugin to handle it as well
if (typeof jQuery != 'undefined')
	jQuery.fn.prettyDate = function () {
		return this.each(function () {
			var date = prettyDate(this.title);
			if (date) jQuery(this).text(date);
		});
	};

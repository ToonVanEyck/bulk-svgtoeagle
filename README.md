bulk-svgtoeagle
===============

Online converter for simple SVG files from Inkscape to Eagle CAD. Based on the work by [Gorodon Williams](https://github.com/gfwilliams/svgtoeagle).

I have moddified his code to support bulk file selection and conversion. I also removed the GUI elements of the webpage as the obstructed these moddifications.

Usage
-----
Upload svg's made with inkscape only!
The inkscape layer label is used to set the eagle layer.

NOTE: Only the default eagle board layers are supported. If your design uses custom layers, they can be supported in the script by adding them to the list on line 7 of ```svgtoeagle.js```.

[Convert Files!](https://toonvaneyck.github.io/bulk-svgtoeagle/)

